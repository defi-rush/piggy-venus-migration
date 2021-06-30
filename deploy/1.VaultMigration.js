module.exports = async ({
  getNamedAccounts, deployments, ethernal
}) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const VaultMigration = await deploy('VaultMigration', {
    from: deployer,
    log: true,
    args: [],
  });
  ethernal.push({
    name: 'VaultMigration',
    address: VaultMigration.address
  });
}
