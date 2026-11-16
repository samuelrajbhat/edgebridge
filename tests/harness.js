const cases = [];

export function test(name, callback) {
    cases.push({name, callback});
}

export function assert(condition, message = 'Assertion failed') {
    if (!condition)
        throw new Error(message);
}

export function equal(actual, expected, message = 'Values differ') {
    assert(Object.is(actual, expected), `${message}: expected ${expected}, got ${actual}`);
}

function canonical(value) {
    if (Array.isArray(value))
        return value.map(canonical);
    if (value !== null && typeof value === 'object')
        return Object.fromEntries(Object.keys(value).sort()
            .map(key => [key, canonical(value[key])]));
    return value;
}

export function deepEqual(actual, expected, message = 'Structures differ') {
    const actualJSON = JSON.stringify(canonical(actual));
    const expectedJSON = JSON.stringify(canonical(expected));
    assert(actualJSON === expectedJSON,
        `${message}: expected ${expectedJSON}, got ${actualJSON}`);
}

export function throws(callback, pattern) {
    try {
        callback();
    } catch (error) {
        if (pattern)
            assert(pattern.test(error.message), `Unexpected error: ${error.message}`);
        return;
    }
    throw new Error('Expected an exception');
}

export function run() {
    let failures = 0;
    for (const {name, callback} of cases) {
        try {
            callback();
            console.log(`PASS ${name}`);
        } catch (error) {
            failures++;
            console.error(`FAIL ${name}: ${error.stack ?? error.message}`);
        }
    }
    console.log(`${cases.length - failures}/${cases.length} tests passed`);
    if (failures > 0)
        throw new Error(`${failures} test(s) failed`);
}
