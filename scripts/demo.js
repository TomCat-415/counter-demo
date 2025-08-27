// scripts/demo.js (pure web3.js, no Anchor client)
const { Connection, PublicKey, Keypair, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } = require("@solana/web3.js");
const fs = require("fs");

(async () => {
  try {
    // === config ===
    const RPC = "https://api.devnet.solana.com";
    const PROGRAM_ID = new PublicKey("2esiwqpYjizvnSQBFcvo5cSNbgzpPVfTW2ew24YUiHj1"); // your devnet program id
    const KEYPAIR_PATH = "/Users/thc/code/solana/devnet.json";                         // your devnet wallet

    // === load wallet ===
    const secret = Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf8")));
    const wallet = Keypair.fromSecretKey(secret);

    const connection = new Connection(RPC, "confirmed");

    // === instruction discriminators (from your IDL) ===
    const DISC_INIT = Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]); // initialize
    const DISC_INCR = Buffer.from([11, 18, 104, 9, 104, 174, 59, 33]);     // increment

    // === create fresh counter account key ===
    const counter = Keypair.generate();

    // --- TX 1: initialize (program will create the account via #[account(init, ...)]) ---
    // Accounts (from IDL):
    // - counter (writable, signer)
    // - payer (writable, signer)
    // - system_program
    const ixInit = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: counter.publicKey, isSigner: true,  isWritable: true  },
        { pubkey: wallet.publicKey,  isSigner: true,  isWritable: true  },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: DISC_INIT, // no args
    });

    let tx = new Transaction().add(ixInit);
    tx.feePayer = wallet.publicKey;
    const sig1 = await sendAndConfirmTransaction(connection, tx, [wallet, counter]);
    console.log("initialize tx:", sig1);

    // --- read account data to confirm value == 0 ---
    // Anchor account discriminator for Counter (from IDL.accounts[0].discriminator):
    const ACC_DISC = Buffer.from([255, 176, 4, 245, 188, 253, 124, 25]);

    const info1 = await connection.getAccountInfo(counter.publicKey, "confirmed");
    if (!info1) throw new Error("Counter account not found after initialize");
    const d1 = Buffer.from(info1.data);

    // first 8 bytes = account discriminator, next 8 bytes = u64 value
    if (!d1.slice(0, 8).equals(ACC_DISC)) {
      throw new Error("Account discriminator mismatch; wrong account or program");
    }
    const val0 = d1.readBigUInt64LE(8);
    console.log("After initialize:", val0.toString()); // expect "0"

    // --- TX 2: increment ---
    // Accounts:
    // - counter (writable)
    const ixIncr = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: counter.publicKey, isSigner: false, isWritable: true },
      ],
      data: DISC_INCR,
    });

    let tx2 = new Transaction().add(ixIncr);
    tx2.feePayer = wallet.publicKey;
    const sig2 = await sendAndConfirmTransaction(connection, tx2, [wallet]);
    console.log("increment tx:", sig2);

    // --- read account again, expect value == 1 ---
    const info2 = await connection.getAccountInfo(counter.publicKey, "confirmed");
    if (!info2) throw new Error("Counter account missing after increment");
    const d2 = Buffer.from(info2.data);
    const val1 = d2.readBigUInt64LE(8);
    console.log("After increment:", val1.toString()); // expect "1"
  } catch (err) {
    console.error("Demo script error:", err);
    process.exit(1);
  }
})();
