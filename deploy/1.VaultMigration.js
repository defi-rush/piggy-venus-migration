module.exports = async ({
  getNamedAccounts, deployments,
  // ethernal
}) => {
  const { deploy } = deployments;
  const {
    deployer,
    DODOStablePool,
    VenusPriceOracle,
    BUSD, PUSD, vBNB, vBUSD,
  } = await getNamedAccounts();
  const VaultMigration = await deploy('VaultMigration', {
    from: deployer,
    log: true,
    args: [
      DODOStablePool,
      VenusPriceOracle,
      BUSD, PUSD, vBNB, vBUSD
    ],
  });
  // ethernal.push({
  //   name: 'VaultMigration',
  //   address: VaultMigration.address
  // });
}
