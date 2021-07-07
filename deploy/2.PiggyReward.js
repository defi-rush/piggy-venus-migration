module.exports = async ({
  getNamedAccounts, deployments, ethers,
  // ethernal
}) => {
  const { deployer, PIGGY } = await getNamedAccounts();
  const VaultMigration = await deployments.get('VaultMigration');
  const PiggyReward = await deployments.deploy('PiggyReward', {
    from: deployer,
    log: true,
    args: [
      'Piggy Migration Reward',
      'mrPiggy',
      VaultMigration.address,
      100,
      PIGGY,
    ],
  });
  const deployerSigner = await ethers.getSigner(deployer);
  const vaultMigration = new ethers.Contract(VaultMigration.address, VaultMigration.abi, deployerSigner);
  const currentPiggyReward = await vaultMigration.piggyReward()
  if (currentPiggyReward !== PiggyReward.address) {
    await vaultMigration.setPiggyReward(PiggyReward.address).then((tx) => tx.wait());
  }
  // ethernal.push({
  //   name: 'PiggyReward',
  //   address: PiggyReward.address
  // });
}
