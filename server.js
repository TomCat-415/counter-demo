const express = require("express");
const cors = require("cors");
const anchor = require("@coral-xyz/anchor");
const { Connection, PublicKey, Transaction } = require("@solana/web3.js");
const fs = require("fs");

const RPC = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("2esiwqpYjizvnSQBFcvo5cSNbgzpPVfTW2ew24YUiHj1");
const IDL = JSON.parse(fs.readFileSync("target/idl/counter.json", "utf8"));

const app = express();
app.use(cors());
app.use(express.json());

// --- GET metadata for Actions/Blinks viewers ---
app.get("/action/counter", (req, res) => {
  // Optional: ?counter=<pubkey> in the querystring
  const { counter } = req.query;
  res.json({
    title: "Increment Counter",
    description: "Builds a transaction to call `increment` on the counter program.",
    icon: "https://avatars.githubusercontent.com/u/35608259?s=200&v=4", // any small square icon
    links: {
      actions: [
        {
          label: "Increment",
          href: `/action/counter/tx${counter ? `?counter=${counter}` : ""}`,
          parameters: [
            { name: "counter", label: "Counter account (Pubkey)", required: !counter }
          ]
        }
      ]
    }
  });
});

// --- POST/GET that returns the unsigned transaction ---
app.all("/action/counter/tx", async (req, res) => {
  try {
    const connection = new Connection(RPC, "confirmed");
    const provider = new anchor.AnchorProvider(connection, {} /* dummy wallet */, {
      preflightCommitment: "confirmed",
    });
    const program = new anchor.Program(IDL, PROGRAM_ID, provider);

    // Where the user's wallet pubkey comes from:
    // - Some Blink viewers send it in JSON { account: "<pubkey>" }
    // - If not present, we allow building with only `counter`, and wallet will be set client-side.
    const userPubkey =
      req.body?.account
        ? new PublicKey(req.body.account)
        : null;

    const counterParam =
      req.method === "GET" ? req.query.counter : (req.body?.counter || req.query?.counter);

    if (!counterParam) {
      return res.status(400).json({ error: "Missing `counter` (public key of the counter account)" });
    }
    const counterPk = new PublicKey(counterParam);

    const ix = await program.methods.increment().accounts({ counter: counterPk }).instruction();

    const tx = new Transaction().add(ix);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;

    // If the client provided a wallet pubkey, set as fee payer
    if (userPubkey) tx.feePayer = userPubkey;

    const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    const b64 = serialized.toString("base64");

    // Return per Actions spec (common fields)
    res.json({
      transaction: b64,
      message: "Approve to increment the counter.",
      // optional: pass a redirect after signature collection
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`Actions server on http://localhost:${PORT}`));
