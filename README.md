<br>
<br>
<p align="center">
  <img src="images/logo.png" alt="Freecoin Logo" width="300">
</p>

# ✠ Freecoin

**A Proof-of-Effort VDF utility protocol with Wesolowski proof construction.**

Freecoin is a pure JavaScript implementation of a Verifiable Delay Function (VDF) built on the RSA-2048 group. It provides a mechanism for "Proof-of-Effort," ensuring that a specific amount of sequential wall-clock time and computational energy has been expended.

Unlike many VDF implementations that prioritize raw speed at the cost of extreme memory usage, Freecoin is engineered for **democratization** and **thermal stability**, making it ideal for browser-based minting and mobile devices.

---

## 💡 The Idea

The core of Freecoin is a **Time-Lock Puzzle** (first proposed by Rivest, Shamir, and Wagner in 1996) enhanced with a **Wesolowski Proof** (2018).

A user must perform  sequential modular squarings to arrive at a result. Because each squaring depends on the result of the previous one, the work cannot be parallelized across multiple CPU cores. Once finished, the user generates a tiny cryptographic proof that allows anyone else to verify the work instantly without re-running the hours or days of computation.



## 🚀 Use Cases

* **Fair Minting:** Distribute tokens or digital assets based on time and electricity spent, rather than who has the most expensive ASIC hardware.
* **Anti-Spam:** Require a "computational stamp" for sending emails or posting to a forum to make mass-spamming economically unviable.
* **Decentralized Lotteries:** Provide a source of randomness that cannot be predicted until a specific amount of time has passed.
* **Rate Limiting:** Protect APIs by requiring a VDF proof for high-frequency requests.



## 🛠 Technical Description

### The Architectural Choice: "Steady-State"

While Wesolowski (2018) identifies that proof generation can be optimized to  time, that approach requires  memory for checkpoint storage. On modern hardware with millions of iterations, this causes significant RAM pressure, garbage collection spikes, and thermal throttling.

**Freecoin intentionally utilizes an  "Double-Pass" approach:**

1. **Phase 1 (Evaluation):**  Time,  Memory. Performs sequential squaring .
2. **Phase 2 (Consensus):** Derives a deterministic prime  from the result .
3. **Phase 3 (Proving):**  Time,  Memory. Generates the proof  using MSB-first streaming.

### Design Rationale

* **Thermal Stability:** By avoiding heavy RAM usage, the CPU stays within manageable temperature limits, preventing the browser from slowing down or crashing.
* **Democratization:** The bottleneck is raw BigInt arithmetic, not memory bandwidth. This levels the playing field between mobile phones and high-end servers.
* **Trustless Setup:** Uses the official **RSA-2048 Challenge Modulus**. Since the factors of this 2048-bit number have been unknown since 1991, there is no "backdoor" for the developer to skip the work.



## 📖 Mathematical Specification (Version 1.0)

To ensure interoperability between implementations (e.g., JavaScript, Rust, Go), Freecoin follows a strict deterministic pipeline based on the Wesolowski VDF.


### 1. The Parameters

* **Modulus ($N$):**
  The RSA-2048 Challenge Number (617 decimal digits).

* **Base ($x$):**
  A starting point in the group, derived via:

$$
  x = \text{SHA-256}(\text{minterId} \parallel \text{challenge} \parallel \text{iterations})
$$

* **Exponent:**
  $2^T$, where $T$ is the number of iterations (squarings).



### 2. Hash-to-Prime (The Random Oracle)

Freecoin uses a non-interactive challenge prime $L$.

To ensure $L$ is chosen fairly, we use a seed derived from the VDF result $y$.

### Seed Generation

$$
\text{seed} = \text{SHA-256}(y)
$$

### Deterministic Search

Starting from the seed:

* Find the first prime $L > 2^{128}$

This $L$ acts as the "challenge" that prevents a prover from cheating.



### 3. The Proof ($\pi$)

The proof is computed using the **Steady-State streaming approach** to calculate the quotient of $2^T$ divided by $L$ without ever materializing the massive integer $2^T$:

$$
\pi = x^{\left\lfloor \frac{2^T}{L} \right\rfloor} \pmod N
$$



### 4. Verification

A Pyx is valid **if and only if**:

1. The prime $L$ is correctly regenerated from $y$.

2. The remainder $r$ is calculated:

$$
   r = 2^T \pmod L
$$

3. The following identity holds:

$$
   \pi^L \cdot x^r \equiv y \pmod N
$$



## 📋 Serialization Standard

To maintain a consistent `pyxId`, data must be serialized in the following order:

| Order | Field        | Type         | Description                         |
| ----- | ------------ | ------------ | ----------------------------------- |
| 1     | `version`    | `Uint8`      | Protocol version (currently `0x01`) |
| 2     | `minterId`   | `Bytes[32]`  | The user's public identity          |
| 3     | `challenge`  | `Bytes[32]`  | The unique entropy for this mint    |
| 4     | `iterations` | `Uint64BE`   | Big-endian 64-bit integer ($T$)     |
| 5     | `y`          | `Bytes[256]` | The result of the VDF (2048 bits)   |
| 6     | `proof`      | `Bytes[256]` | The Wesolowski proof ($\pi$)        |




## 📦 Installation & Usage

Simply include `freecoin.js` in your project.

```javascript
import { mintPyx } from './freecoin.js';

const minterId = crypto.getRandomValues(new Uint8Array(32));
const challenge = crypto.getRandomValues(new Uint8Array(32));
const iterations = 100000;

// Mint a Pyx (VDF Proof)
const pyx = await mintPyx(minterId, challenge, iterations, (progress) => {
    console.log(`Minting progress: ${progress}%`);
});

// Verify a Pyx
const { valid, error } = await pyx.verify();
console.log(valid ? "✅ Valid Proof" : `❌ Invalid: ${error}`);

```
### ✠ Quick Start

For Node.js.

```bash
# Clone the repository
git clone https://github.com/AndersLindman/freecoin.git

# Move to directory
cd freecoin

# Run the test suite to verify the VDF logic
npm test
```

## ⚖️ License

**CC0-1.0 Universal** (Public Domain). Freecoin is a public utility for centralized and decentralized systems.
