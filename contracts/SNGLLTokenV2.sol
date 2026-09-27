// SPDX-License-Identifier: MIT
pragma solidity ^0.8.37;

import {SNGLLToken} from "./SNGLLToken.sol";

/**
 * V2: cambia el nombre visible a "SNGLL" (antes "SNGLL Token") sin tocar storage.
 *
 * - name()/symbol() se sobrescriben para devolver el valor nuevo.
 * - _EIP712Name() se sobrescribe para que el dominio de `permit` (EIP-2612)
 *   use el mismo nombre. En OZ 5.6 el domain separator no se cachea, por lo
 *   que el cambio queda consistente automaticamente.
 *
 * No agrega variables de estado -> upgrade seguro.
 *
 * @custom:oz-upgrades-unsafe-allow missing-initializer
 */
contract SNGLLTokenV2 is SNGLLToken {
    function name() public view virtual override returns (string memory) {
        return "SNGLL";
    }

    function symbol() public view virtual override returns (string memory) {
        return "SNGLL";
    }

    function _EIP712Name() internal view virtual override returns (string memory) {
        return "SNGLL";
    }

    function version() external pure returns (string memory) {
        return "v2";
    }
}
