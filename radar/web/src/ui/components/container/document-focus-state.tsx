import * as React from "react";
import { useContext, useEffect, useState } from "react";

const ContextDocumentFocusState = React.createContext<boolean>(false);
export const DocumentFocusStateProvider = (props: {
    children: React.ReactNode
}) => {
    const [focus, updateFocus] = useState<boolean>(document.hasFocus());
    useEffect(() => {
        const setFocus = () => updateFocus(true);
        const clearFocus = () => updateFocus(false);

        document.addEventListener("focusin", setFocus);
        document.addEventListener("focusout", clearFocus);

        document.addEventListener("mouseenter", setFocus);
        document.addEventListener("mouseleave", clearFocus);
        return () => {
            document.removeEventListener("focusin", setFocus);
            document.removeEventListener("focusout", clearFocus);

            document.removeEventListener("mouseenter", setFocus);
            document.removeEventListener("mouseleave", clearFocus);
        }
    }, []);

    return (
        <ContextDocumentFocusState.Provider value={focus}>
            {props.children}
        </ContextDocumentFocusState.Provider>
    )
};

export const useDocumentFocusState = () => useContext(ContextDocumentFocusState);