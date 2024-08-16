import { EventEmitter } from "../utils/ee";
import { C2SMessage, HandshakeProtocolV2, RadarState, S2CMessage } from "./definitions";

export type SubscriberClientState =
    | {
        state: "new" | "connecting" | "handshaking" | "initializing" | "connected" | "disconnected";
    }
    | {
        state: "failed";
        reason: string;
    };

export interface SubscriberClientEvents {
    state_changed: SubscriberClientState;
    "radar.state": RadarState;
}

export class UpdateStatistics {
    private readonly alpha: number = 0.98;

    private timestampLastUpdate: number | null = null;

    private history: number[] = [];
    private historyIndex: number = 0;

    private movingAverage: number = 0;

    constructor() {
        this.history = [...new Array(100)];
        this.history.fill(0);
    }

    public logUpdate() {
        const now = performance.now();
        if (!this.timestampLastUpdate) {
            this.timestampLastUpdate = now;
        } else {
            const passed = now - this.timestampLastUpdate;
            this.timestampLastUpdate = now;

            this.history[this.historyIndex] = passed;
            this.historyIndex = (this.historyIndex + 1) % this.history.length;

            this.movingAverage = this.movingAverage * this.alpha + passed * (1 - this.alpha);
        }
    }

    public getAverageInterval(): number {
        return this.movingAverage;
    }

    public getLastInterval(): number {
        return this.history[this.historyIndex];
    }

    public getHistory(): Readonly<number[]> {
        return this.history;
    }
}

export class SubscriberClient {
    readonly events: EventEmitter<SubscriberClientEvents>;
    readonly stateUpdateStatistics: UpdateStatistics = new UpdateStatistics();

    private currentState: SubscriberClientState;
    private connection: WebSocket | null;
    private currentRadarState: RadarState | null;


    private commandHandler: { [T in S2CMessage["type"]]?: (payload: (S2CMessage & { type: T })["payload"]) => void } =
        {};

    constructor(readonly targetAddress: string) {
        this.events = new EventEmitter();
        this.events.setMaxListeners(60);

        this.currentState = { state: "new" };
        this.connection = null;

        (window as any).s = this.stateUpdateStatistics;

        this.commandHandler = {};
        this.commandHandler["response-error"] = (payload) => {
            this.updateState({ state: "failed", reason: payload.error });
            this.closeSocket();
        };

        this.commandHandler["response-session-invalid-id"] = () => {
            this.updateState({ state: "failed", reason: "session does not exists" });
            this.closeSocket();
        };

        this.commandHandler["response-subscribe-success"] = () => {
            this.updateState({ state: "connected" });
        };

        this.commandHandler["notify-radar-state"] = (payload) => {
            this.currentRadarState = payload.state;
            this.stateUpdateStatistics.logUpdate();
            this.events.emit("radar.state", payload.state);
        };

        this.commandHandler["notify-session-closed"] = () => {
            this.updateState({ state: "disconnected" });
        };
    }

    public getCurrentRadarState(): Readonly<RadarState> {
        return this.currentRadarState;
    }

    public getState(): Readonly<SubscriberClientState> {
        return this.currentState;
    }

    private updateState(newState: SubscriberClientState) {
        if (this.currentState === newState) {
            return;
        }

        this.currentState = newState;
        this.events.emit("state_changed", newState as any);
    }

    private closeSocket() {
        if (!this.connection) {
            return;
        }

        this.connection.onopen = undefined;
        this.connection.onclose = undefined;
        this.connection.onerror = undefined;
        this.connection.onmessage = undefined;
        if (this.connection.readyState === WebSocket.OPEN) {
            this.connection.close();
        }
        this.connection = null;
    }

    public connect(sessionId: string) {
        if (this.currentState.state != "new") {
            throw new Error(`invalid session state`);
        }

        this.updateState({ state: "connecting" });
        this.connection = new WebSocket(this.targetAddress);
        this.connection.onopen = () => {
            this.updateState({ state: "handshaking" });
            this.connection.send(
                JSON.stringify({
                    type: "request-initialize",
                    payload: {
                        clientVersion: 2,
                    },
                } satisfies HandshakeProtocolV2),
            );
        };

        this.connection.onerror = () => {
            this.updateState({ state: "failed", reason: "web socket error" });
            this.closeSocket();
        };

        this.connection.onclose = () => {
            if (this.currentState.state !== "disconnected") {
                this.updateState({ state: "failed", reason: "web socket closed" });
                this.closeSocket();
            }
        };

        this.connection.onmessage = (event) => {
            if (this.currentState.state === "handshaking") {
                const payload = JSON.parse(event.data as string) as HandshakeProtocolV2;
                switch (payload.type) {
                    case "response-generic-failure":
                        this.updateState({ state: "failed", reason: payload.payload.message });
                        this.closeSocket();
                        break;

                    case "response-incompatible":
                        this.updateState({ state: "failed", reason: "protocol incompatible" });
                        this.closeSocket();
                        break;

                    case "response-success":
                        this.updateState({ state: "initializing" });
                        this.sendCommand("initialize-subscribe", {
                            session_id: sessionId,
                        });
                        break;

                    default:
                        this.updateState({ state: "failed", reason: "invalid handshake response" });
                        this.closeSocket();
                        break;
                }
            } else if (this.currentState.state === "initializing" || this.currentState.state === "connected") {
                const payload = JSON.parse(event.data as string) as S2CMessage;
                const commandHandler = this.commandHandler[payload.type];
                if (typeof commandHandler === "function") {
                    commandHandler(payload.payload as any);
                }
            }
        };
    }

    public sendCommand<T extends C2SMessage["type"]>(
        command: T,
        payload: (C2SMessage | (HandshakeProtocolV2 & { type: T }))["payload"],
    ) {
        this.connection.send(
            JSON.stringify({
                type: command,
                payload,
            }),
        );
    }
}

export const kDefaultRadarState: RadarState = {
    localControllerEntityId: null,

    playerPawns: [],
    worldName: "<empty>",

    c4Entities: [],
    plantedC4: null,
};
