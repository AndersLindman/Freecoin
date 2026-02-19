import { mintPyx } from './freecoin.js';

async function runTest() {
    console.log("✠ Freecoin VDF Sanity Check");
    console.log("----------------------------");

    const iterations = 50000;
    const minterId = new Uint8Array(32).fill(1); // Standardized for test
    const challenge = new Uint8Array(32).fill(2);

    console.log(`Testing ${iterations} iterations...`);

    const start = Date.now();
    const pyx = await mintPyx(minterId, challenge, iterations);
    const end = Date.now();

    const duration = (end - start) / 1000;
    const speed = Math.round(iterations / duration);

    console.log(`\nFinal Result (y): \n${JSON.stringify(pyx.toJSON(), null, 2)}\n`);
    console.log(`Time: ${duration}s (${speed} iterations/sec)`);

    const { valid } = await pyx.verify();

    if (valid) {
        console.log("✅ VERIFICATION SUCCESSFUL: Proof is mathematically sound.");
    } else {
        console.error("❌ VERIFICATION FAILED: Math mismatch detected.");
        process.exit(1);
    }
}

runTest().catch(console.error);