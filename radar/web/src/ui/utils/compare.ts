export function shallowEqual(a: any, b: any) {
    const typeA = typeof a;
    if (typeA !== typeof b) {
        return false;
    }

    if (typeA !== "object" || a === null || b === null) {
        return a === b;
    }

    for (const key of Object.keys(a)) {
        if (b[key] !== a[key]) {
            return false;
        }
    }

    for (const key of Object.keys(b)) {
        if (b[key] !== a[key]) {
            return false;
        }
    }

    return true;
}