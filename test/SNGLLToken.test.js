const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

const ONE = 10n ** 18n;
const TOTAL_SUPPLY = 1_200_000_000n * ONE;

describe("SNGLLToken (ERC20 + UUPS)", function () {
  let token;
  let recipient, admin, upgrader, other;

  beforeEach(async function () {
    [, recipient, admin, upgrader, other] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("SNGLLToken");
    token = await upgrades.deployProxy(
      Factory,
      [recipient.address, admin.address, upgrader.address],
      { kind: "uups" }
    );
    await token.waitForDeployment();
  });

  it("expone la metadata correcta", async function () {
    expect(await token.name()).to.equal("SNGLL Token");
    expect(await token.symbol()).to.equal("SNGLL");
    expect(await token.decimals()).to.equal(18n);
  });

  it("acuña el supply completo al recipient", async function () {
    expect(await token.totalSupply()).to.equal(TOTAL_SUPPLY);
    expect(await token.balanceOf(recipient.address)).to.equal(TOTAL_SUPPLY);
  });

  it("asigna DEFAULT_ADMIN_ROLE y UPGRADER_ROLE", async function () {
    const ADMIN = await token.DEFAULT_ADMIN_ROLE();
    const UPGRADER = await token.UPGRADER_ROLE();

    expect(await token.hasRole(ADMIN, admin.address)).to.equal(true);
    expect(await token.hasRole(UPGRADER, upgrader.address)).to.equal(true);
    expect(await token.hasRole(ADMIN, other.address)).to.equal(false);
    expect(await token.hasRole(UPGRADER, other.address)).to.equal(false);
  });

  it("no tiene funcion mint (supply fijo)", async function () {
    expect(token.mint).to.equal(undefined);
  });

  it("permite burn a los holders", async function () {
    await token.connect(recipient).burn(ONE);
    expect(await token.totalSupply()).to.equal(TOTAL_SUPPLY - ONE);
  });

  it("soporta permit (EIP-2612): nonces arranca en 0", async function () {
    expect(await token.nonces(recipient.address)).to.equal(0n);
  });

  it("usa clock en modo timestamp (gobernanza por fecha)", async function () {
    expect(await token.CLOCK_MODE()).to.equal("mode=timestamp");
    expect(await token.clock()).to.be.greaterThan(0n);
  });

  it("delega votos correctamente", async function () {
    await token.connect(recipient).delegate(recipient.address);
    expect(await token.getVotes(recipient.address)).to.equal(TOTAL_SUPPLY);
  });

  it("solo UPGRADER_ROLE puede subir la implementacion", async function () {
    const FactoryV2 = await ethers.getContractFactory("SNGLLTokenV2");
    const proxyAddress = await token.getAddress();

    await expect(
      upgrades.upgradeProxy(proxyAddress, FactoryV2.connect(other), {
        kind: "uups",
      })
    ).to.be.reverted;

    const upgraded = await upgrades.upgradeProxy(
      proxyAddress,
      FactoryV2.connect(upgrader),
      { kind: "uups" }
    );
    await upgraded.waitForDeployment();

    expect(await upgraded.version()).to.equal("v2");
    // el estado se preserva tras el upgrade
    expect(await upgraded.totalSupply()).to.equal(TOTAL_SUPPLY);
    expect(await upgraded.balanceOf(recipient.address)).to.equal(TOTAL_SUPPLY);
  });

  it("handover: pasa los roles al Safe y el EOA renuncia", async function () {
    const ADMIN = await token.DEFAULT_ADMIN_ROLE();
    const UPGRADER = await token.UPGRADER_ROLE();
    const safe = other.address;

    // 1) otorgar al "Safe" (el admin puede otorgar ambos roles)
    await token.connect(admin).grantRole(ADMIN, safe);
    await token.connect(admin).grantRole(UPGRADER, safe);

    // 2) el EOA renuncia a sus propios roles
    await token.connect(upgrader).renounceRole(UPGRADER, upgrader.address);
    await token.connect(admin).renounceRole(ADMIN, admin.address);

    // el Safe queda como unico control
    expect(await token.hasRole(ADMIN, safe)).to.equal(true);
    expect(await token.hasRole(UPGRADER, safe)).to.equal(true);
    expect(await token.hasRole(ADMIN, admin.address)).to.equal(false);
    expect(await token.hasRole(UPGRADER, upgrader.address)).to.equal(false);

    // y el EOA ya no puede autorizar upgrades
    const FactoryV2 = await ethers.getContractFactory("SNGLLTokenV2");
    await expect(
      upgrades.upgradeProxy(await token.getAddress(), FactoryV2.connect(upgrader), {
        kind: "uups",
      })
    ).to.be.reverted;
  });

  it("V2: nombre y simbolo SNGLL, y permit sigue funcionando", async function () {
    const FactoryV2 = await ethers.getContractFactory("SNGLLTokenV2");
    const proxyAddress = await token.getAddress();

    const upgraded = await upgrades.upgradeProxy(
      proxyAddress,
      FactoryV2.connect(upgrader),
      { kind: "uups" }
    );
    await upgraded.waitForDeployment();

    expect(await upgraded.name()).to.equal("SNGLL");
    expect(await upgraded.symbol()).to.equal("SNGLL");
    expect(await upgraded.totalSupply()).to.equal(TOTAL_SUPPLY);
    expect(await upgraded.balanceOf(recipient.address)).to.equal(TOTAL_SUPPLY);

    // el dominio EIP-712 debe reportar el nombre nuevo
    const domain = await upgraded.eip712Domain();
    expect(domain[1]).to.equal("SNGLL");

    // permit debe validar firmando con el nombre nuevo
    const { chainId } = await ethers.provider.getNetwork();
    const value = ONE;
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const nonce = await upgraded.nonces(recipient.address);

    const signature = await recipient.signTypedData(
      { name: "SNGLL", version: "1", chainId, verifyingContract: proxyAddress },
      {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      {
        owner: recipient.address,
        spender: other.address,
        value,
        nonce,
        deadline,
      }
    );

    const { v, r, s } = ethers.Signature.from(signature);
    await upgraded.permit(
      recipient.address,
      other.address,
      value,
      deadline,
      v,
      r,
      s
    );

    expect(await upgraded.allowance(recipient.address, other.address)).to.equal(
      value
    );
  });
});
