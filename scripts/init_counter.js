// scripts/init_counter.js
const anchor = require("@coral-xyz/anchor");
const { SystemProgram, Keypair, PublicKey, Connection } = require("@solana/web3.js");
const fs = require("fs");

function normalizeIdl(idl) {
  if (!idl?.accounts) return idl;
  const typeMap = new Map((idl.types ?? []).map(t => [t.name, t.type]));
  idl.accounts = idl.accounts.map(a => (a.type ? a : { ...a, type: typeMap.get(a.name) }));
  return idl;
}

(async () => {
  const RPC = "https://api.devnet.solana.com";
  const programId = new PublicKey("2esiwqpYjizvnSQBFcvo5cSNbgzpPVfTW2ew24YUiHj1");
  const keypairPath = "/Users/thc/code/solana/devnet.json";

  const secret = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf8")));
  const wallet = anchor.web3.Keypair.fromSecretKey(secret);
  const connection = new Connection(RPC, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), { preflightCommitment: "confirmed" });
  anchor.setProvider(provider);

  let idl = require("../target/idl/counter.json");
  idl = normalizeIdl(idl);
  const program = new anchor.Program(idl, provider);

  const counter = Keypair.generate();
  const sig = await program.methods.initialize().accounts({
    counter: counter.publicKey,
    payer: wallet.publicKey,
    systemProgram: SystemProgram.programId,
  }).signers([counter]).rpc();

  console.log("Counter address:", counter.publicKey.toBase58());
  console.log("initialize tx:", sig);

  // Save it for future use
  fs.writeFileSync("counter-address.txt", counter.publicKey.toBase58() + "\n", { flag: "a" });

  const acct = await program.account.counter.fetch(counter.publicKey);
  console.log("value:", acct.value.toString());
})();
