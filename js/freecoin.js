/**
 * ✠ Freecoin (freecoin.js)
 * Pure JavaScript Wesolowski RSA-2048 VDF
 *  @version 1.0.0 (Cyclotomic Update)
 *  @author Anders Lindman
 *  @date 2026-02-19
 *  @license CC0-1.0
 *
 * ------------------------------------------------------------
 * ARCHITECTURAL CHOICE: Steady-State vs. High-Memory Proving
 * ------------------------------------------------------------
 *
 * Wesolowski (2018) describes a proof generation optimization to
 * O(T / log T) time using multi-exponentiation (e.g. Pippenger's
 * algorithm). However, that approach requires O(√T) or greater
 * memory for checkpoint storage.
 *
 * This implementation intentionally chooses the O(T) "Double-Pass"
 * steady-state approach:
 *
 *   PHASE 1 — Sequential Squaring (Evaluation)
 *     Time:  O(T)
 *     Memory: O(1)
 *
 *   PHASE 2 — Prime Derivation (Deterministic Consensus)
 *
 *   PHASE 3 — MSB-First Streaming Proof (Proving)
 *     Time:  O(T)
 *     Memory: O(1)
 *
 * ------------------------------------------------------------
 * DESIGN RATIONALE
 * ------------------------------------------------------------
 *
 * • THERMAL STABILITY
 *   Avoids heavy RAM checkpointing and GC spikes that can cause
 *   throttling in browsers and mobile devices.
 *
 * • DEMOCRATIZATION
 *   Equalizes performance between low-power devices and high-end
 *   desktops. The bottleneck is sequential BigInt squaring,
 *   not memory bandwidth.
 *
 * • ATOMICITY
 *   Eliminates out-of-memory risks for long-running mints
 *   (>10M iterations).
 *
 * • LINEAR SCALING
 *   Predictable CPU-bound performance suitable for browsers,
 *   laptops, and smartphones.
 *
 * ------------------------------------------------------------
 * SECURITY NOTE
 * ------------------------------------------------------------
 *
 * Uses the official RSA-2048 Challenge Modulus (RSA-2048).
 * This provides a "Trustless Setup" as the factors are unknown
 * to the developer and have remained unfactored since 1991.
 *
 * ------------------------------------------------------------
 */

// --- 1. Encoding Helpers ---
const bytesToBigInt = (b) => BigInt('0x' + Array.from(b).map(x => x.toString(16).padStart(2, '0')).join(''));
const bigIntToUint8Array = (bi) => {
    let hex = bi.toString(16);
    if (hex.length % 2) hex = '0' + hex;
    const len = hex.length / 2;
    const u8 = new Uint8Array(len);
    for (let i = 0; i < len; i++) u8[i] = parseInt(hex.substr(i * 2, 2), 16);
    return u8;
};
const bytesToBase64 = (b) => btoa(Array.from(b, x => String.fromCharCode(x)).join(""));
const base64ToBytes = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

const concatFields = (...fields) => {
    const arrays = fields.map(f => {
        if (f instanceof Uint8Array) return f;
        if (typeof f === 'bigint') return bigIntToUint8Array(f);
        if (typeof f === 'number') {
            const b = new ArrayBuffer(4);
            new DataView(b).setUint32(0, f, false);
            return new Uint8Array(b);
        }
        return new Uint8Array(0);
    });
    const total = arrays.reduce((acc, cur) => acc + cur.length, 0);
    const res = new Uint8Array(total);
    let off = 0;
    for (const a of arrays) { res.set(a, off); off += a.length; }
    return res;
};

// --- 2. Math Core ---
const N_STR = // RSA 2048 number
    "251959084756578934940271832400483985714292821262040320277771378360436620207075955562" +
    "640185258807844069182906412495150821892985591491761845028084891200728449926873928072" +
    "877767359714183472702618963750149718246911650776133798590957000973304597488084284017" +
    "974291006424586918171951187461215151726546322822168699875491824224336372590851418654" +
    "620435767984233871847744479207399342365848238242811981638150106748104516603773060562" +
    "016196762561338441436038339044149526344321901146575444541784240209246165157233507787" +
    "077498171257724679629263863563732899121548314381678998850404453640235273819513786365" +
    "64391212010397122822120720357";
const N = BigInt(N_STR);

function modPow(base, exp, mod) {
    let res = 1n; base %= mod;
    while (exp > 0n) {
        if (exp % 2n === 1n) res = (res * base) % mod;
        exp /= 2n; base = (base * base) % mod;
    }
    return res;
}

// --- 3. Deterministic Consensus Primality ---
async function getDeterministicWitness(n, round) {
    const data = concatFields(n, round);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return (bytesToBigInt(new Uint8Array(hash)) % (n - 4n)) + 2n;
}

async function isProbablyPrime(n, k = 40) {
    if (n < 2n) return false;
    if (n === 2n || n === 3n) return true;
    if (n % 2n === 0n) return false;
    let d = n - 1n, r = 0n;
    while (d % 2n === 0n) { d /= 2n; r++; }
    for (let i = 0; i < k; i++) {
        const a = await getDeterministicWitness(n, i);
        let x = modPow(a, d, n);
        if (x === 1n || x === n - 1n) continue;
        let composite = true;
        for (let j = 0n; j < r - 1n; j++) {
            x = (x * x) % n;
            if (x === n - 1n) { composite = false; break; }
        }
        if (composite) return false;
    }
    return true;
}

async function findPrimeAfter(bytes) {
    let candidate = bytesToBigInt(bytes.slice(0, 32));
    if (candidate % 2n === 0n) candidate += 1n;
    const SMALL = [3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53];
    while (true) {
        let skip = false;
        for (let p of SMALL) if (candidate % BigInt(p) === 0n && candidate !== BigInt(p)) { skip = true; break; }
        if (!skip && await isProbablyPrime(candidate, 40)) return candidate;
        candidate += 2n;
    }
}

// --- 4. The Pyx Class ---
class Pyx {
    #pyxId; #minterId; #challenge; #iterations; #result; #proof;
    constructor(m, c, i) { this.#minterId = m; this.#challenge = c; this.#iterations = i; }

    async getId() {
        if (this.#pyxId) return this.#pyxId;
        const data = concatFields(this.#minterId, this.#challenge, this.#iterations, this.#result, this.#proof);
        this.#pyxId = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
        return this.#pyxId;
    }

    setPyxId(id) { this.#pyxId = id; }
    setResult(res) { this.#result = res; }
    setProof(p) { this.#proof = p; }

    async verify() {
        if (!this.#proof || !this.#result) {
            return { valid: false, error: "Missing proof or result" };
        }

        try {
            const L = await findPrimeAfter(bigIntToUint8Array(this.#result));
            const r = modPow(2n, BigInt(this.#iterations), L);
            const term1 = modPow(this.#proof, L, N);
            const x = await deriveBaseX(this.#minterId, this.#challenge, this.#iterations);
            const term2 = modPow(x, r, N);
            const lhs = (term1 * term2) % N;

            if (lhs === this.#result) {
                return { valid: true };
            } else {
                return { valid: false, error: "Proof mismatch: π^L · x^r ≢ y (mod N)" };
            }
        } catch (e) {
            return { valid: false, error: "Verification error: " + e.message };
        }
    }

    toJSON() {
        return {
            pyxId: this.#pyxId ? bytesToBase64(this.#pyxId) : null,
            minterId: bytesToBase64(this.#minterId),
            challenge: bytesToBase64(this.#challenge),
            iterations: this.#iterations,
            result: this.#result ? bytesToBase64(bigIntToUint8Array(this.#result)) : null,
            proof: this.#proof ? bytesToBase64(bigIntToUint8Array(this.#proof)) : null
        };
    }

    static fromJSON(json) {
        const schema = validatePyxSchema(json);
        if (!schema.valid) return { success: false, error: schema.error };

        try {
            const m = base64ToBytes(json.minterId);
            const c = base64ToBytes(json.challenge);
            const r = bytesToBigInt(base64ToBytes(json.result));
            const p = bytesToBigInt(base64ToBytes(json.proof));

            const pyx = new Pyx(m, c, json.iterations);
            pyx.setResult(r);
            pyx.setProof(p);
            if (json.pyxId) pyx.setPyxId(base64ToBytes(json.pyxId));

            return { success: true, pyx };
        } catch (e) {
            return { success: false, error: "Invalid data encoding" };
        }
    }
}

// --- 5. Public Minting Function ---
export async function mintPyx(minterId, challenge, iterations, onProgress = null) {
    const pyx = new Pyx(minterId, challenge, iterations);
    const x = await deriveBaseX(minterId, challenge, iterations);
    const chunkSize = 1000;

    // --- Phase 1: Sequential Squaring (0% → 70%) ---
    let result = x;
    for (let i = 0; i < iterations; i += chunkSize) {
        const end = Math.min(i + chunkSize, iterations);
        for (let j = i; j < end; j++) result = (result * result) % N;

        if (onProgress) {
            const pct = Math.floor((end / iterations) * 50);  // 0 → 70
            onProgress(pct);
        }
        if (i % 50000 === 0) await new Promise(r => setTimeout(r, 0));
    }
    pyx.setResult(result);

    // --- Phase 2: Derive Prime L (70% → 75%) ---
    const L = await findPrimeAfter(bigIntToUint8Array(result));

    // --- Phase 3: Proof Generation (75% → 100%) ---
    let proof = 1n;
    let remainder = 1n;

    for (let i = 0; i < iterations; i += chunkSize) {
        const end = Math.min(i + chunkSize, iterations);
        for (let j = i; j < end; j++) {
            const doubled = remainder * 2n;
            const bit = doubled / L;
            remainder = doubled % L;

            proof = (proof * proof) % N;
            if (bit === 1n) proof = (proof * x) % N;
        }

        if (onProgress) {
            const pct = 50 + Math.floor(((end / iterations) * 50));  // 50 → 100
            onProgress(pct);
        }
        if (i % 50000 === 0) await new Promise(r => setTimeout(r, 0));
    }

    pyx.setProof(proof);
    await pyx.getId();

    if (onProgress) onProgress(100);  // Ensure 100% at end
    return pyx;
}

async function deriveBaseX(minterId, challenge, iterations) {
    // 1. Concatenate inputs: [minterId (32b)] + [challenge (32b)] + [iterations (8b)]
    const iterBytes = new BigUint64Array([BigInt(iterations)]);
    const combined = new Uint8Array([...minterId, ...challenge, ...new Uint8Array(iterBytes.buffer).reverse()]);

    // 2. Hash them
    const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
    const hashArray = new Uint8Array(hashBuffer);

    // 3. Convert to BigInt and ensure it is < N and > 1
    // (We use % N to keep it in the group)
    return BigInt('0x' + Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('')) % N;
}

export function validatePyxSchema(data) {
    if (!data || typeof data !== 'object') return { valid: false, error: "Not an object" };
    const req = ["minterId", "challenge", "iterations", "result", "proof"];
    for (const f of req) if (!data[f]) return { valid: false, error: `Missing ${f}` };

    if (typeof data.iterations !== 'number' || data.iterations < 1) return { valid: false, error: "Invalid iterations" };
    if (data.result.length > 512 || data.proof.length > 512) return { valid: false, error: "Payload too large" };

    return { valid: true };
}

export { Pyx };
