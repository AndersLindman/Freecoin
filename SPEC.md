# ✠ Freecoin Protocol Specification (v1.0.0)

This document defines the technical standards for the Freecoin Verifiable Delay Function (VDF), ensuring that implementations across different environments (Node.js, Browser, Rust, Go, etc.) remain mathematically compatible.

---

## 1. Cryptographic Constants

- **Modulus ($N$):** The RSA-2048 challenge number (2048 bits).
- **Hash Function:** SHA-256 is used for all internal entropy and prime derivation.
- **VDF Type:** Wesolowski (2018) non-interactive Proof-of-Work.

---

## 2. Input Requirements

To ensure protocol security and data efficiency, all Freecoin minting attempts must utilize fixed-size inputs:

| Field | Size | Description |
| :--- | :--- | :--- |
| `minterId` | 32 Bytes | SHA-256 hash of the minter's public identity. |
| `challenge`| 32 Bytes | Unique entropy provided for the specific minting task. |
| `iterations`| 8 Bytes | A 64-bit integer ($T$) representing the number of squarings. |

---

## 3. The Minting Pipeline

### 3.1 Base Derivation ($x$)
The starting value $x$ is bound to the identity and the work. It is derived as follows:
1. Concatenate: `minterId` (32B) + `challenge` (32B) + `iterations` (8B, Big-Endian).
2. Compute `hash = SHA-256(concatenated_data)`.
3. Set $x = \text{BigInt}(hash) \pmod N$.

### 3.2 Evaluation Phase
The minter calculates the VDF result $y$ by performing $T$ successive squarings:
$$y = x^{(2^T)} \pmod N$$

### 3.3 Proof Generation ($\pi$)
The minter generates a Wesolowski proof to allow $O(1)$ verification:
1. Derive the challenge prime $L$ (see Section 4).
2. Compute $\pi = x^{\lfloor 2^T / L \rfloor} \pmod N$.
   *(Note: This must be implemented using a streaming quotient algorithm to avoid calculating $2^T$ directly.)*

---

## 4. Prime Challenge Derivation ($L$)

The prime $L$ acts as the "Random Oracle" challenge. It must be derived deterministically from the result $y$:
1. Compute `seed = SHA-256(y)`.
2. Treat `seed` as a 256-bit Big-Endian integer.
3. Find the smallest prime $L$ such that $L \geq seed$.

---

## 5. Verification Identity

A Pyx is considered valid if the following mathematical identity holds:
1. $r = 2^T \pmod L$
2. $\pi^L \cdot x^r \equiv y \pmod N$

---

## 6. Serialization Standard

For transmission and the generation of the `pyxId`, the data must be serialized in the following order:
`[version: 1B] + [minterId: 32B] + [challenge: 32B] + [iterations: 8B] + [y: 256B] + [proof: 256B]`

The `pyxId` is defined as `SHA-256(serialized_data)`.

## 7. ✠ Freecoin v1.0.0 Compliance Test Vectors

| Parameter       | Value (Hex/Decimal)                |
|-----------------|-----------------------------------|
| Minter ID       | 010101...01 (32 bytes of 0x01)   |
| Challenge       | 020202...02 (32 bytes of 0x02)   |
| Iterations      | 50000                             |
| Expected Base x | e80de80f6dde14cd2dd9690f3e2215b4609810bd35a10d531095c314883dfd16 |
| Result | 9cf29c5108763beeb964557e1e89ea90d441c9b6e2286d0c4c50ca1e8b3b4bf2a4c5be5a9ee31b0202f4e35748c82c81c00c4311299546ab360a4699e451cf8207dee2d43594f13a0c090f8bb28d207f567d08e190079f167f199f5d02b8d8bab768f6e386a4b031e6990f18b57fd3dba7531540466e4bcf13cb8104604f48c0f65bca7832465c5e93187c2c4643d34ed0923d8a3b7535b18693d540b1b5ac0973a6730732a10202da9d5bf7dc704bf5bea0fb8896d7baae027df66e98a9aa43632f7a55a2208f024779b452a8988ed88f24b9e5f118b8b0a8952d0c366abb3b822c2a3d43ae467ca38c379bd50b4964aecb104a3803aa2c372261dd4dd17c6c  |
| Expected Prime L| 9cf29c5108763beeb964557e1e89ea90d441c9b6e2286d0c4c50ca1e8b3b4c21  |
| Proof      | 624b5070ee120bc374f9bd9b5afc8708c1a8be4f8f5f90aa8bfa34ab269d95f4946bd670979a5514791dba491de1dc15e70d42758b8d0bba6979c7e6bf9a182ab574df51c2968f9b0e76331225ba1a9a65b3279582cf0ca1f264eb26b10af4376b6c73b4d8ae23698fb05bbda60a8dc79f4016bb703afdb17b6d3eb8b20db1ba30435519b6cfc1f2951bc130db7367d57a6344acd499ac2ea73268d10845069a448a8976d1fc364a0921a3f406dab6e105f88a233c4c08177ef10db84ee35f6e5079bf234aeb6b00be05ca3aad7dbd14502a6244a650b07545388c04810c0874c667d9db165d3e87754bacd0ed857c50cd5a9951606ad708c3ff29a76e505365                            |

---
