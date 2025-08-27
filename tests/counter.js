const anchor = require("@coral-xyz/anchor");
const { SystemProgram, Keypair } = anchor.web3;

describe("counter", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);

  const program = anchor.workspace.Counter;

  it("Is initialized!", async () => {
    // fresh counter account we will create
    const counter = Keypair.generate();

    // initialize it on-chain
    await program.methods
      .initialize()
      .accounts({
        counter: counter.publicKey,
        payer: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([counter]) // must sign to create the account
      .rpc();

    // check it starts at 0
    const acct = await program.account.counter.fetch(counter.publicKey);
    if (acct.value.toString() !== "0") {
      throw new Error(`Expected value 0, got ${acct.value.toString()}`);
    }

    // increment once
    await program.methods
      .increment()
      .accounts({ counter: counter.publicKey })
      .rpc();

    // confirm it moved to 1
    const acct2 = await program.account.counter.fetch(counter.publicKey);
    if (acct2.value.toString() !== "1") {
      throw new Error(`Expected value 1, got ${acct2.value.toString()}`);
    }
  });
});
