import React from "react";
import { Box, SxProps, Theme } from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";

export type ContainerSize = {
    width: number,
    height: number
};

type Props = {
    sx?: SxProps<Theme>,
    children: (size: ContainerSize) => React.ReactNode
};

export default React.forwardRef<HTMLDivElement, Props>((props, refForward) => {
    const [currentSize, setSize] = useState<ContainerSize>({ width: 1, height: 1 });

    const refLocal = useRef<HTMLDivElement>(null);
    const observer = useMemo(() => {
        return new ResizeObserver(events => {
            const event = events[events.length - 1];
            const { width, height } = event.contentRect;
            setSize({ width, height });
        });
    }, [setSize]);

    useEffect(() => {
        if (!refLocal.current) {
            return;
        }

        observer.observe(refLocal.current);
        return () => observer.disconnect();
    }, [refLocal, observer]);

    return (
        <Box
            ref={(node: HTMLDivElement) => {
                refLocal.current = node;
                if (typeof refForward === "function") {
                    refForward(node);
                } else if (refForward) {
                    refForward.current = node;
                }
            }}
            sx={{
                position: "absolute",

                top: 0,
                left: 0,
                right: 0,
                bottom: 0,

                ...props.sx
            }}
        >
            {props.children(currentSize)}
        </Box>
    )
});