'use strict';

/**
 * @param {String} token might match the following pattern: {user}@{tpl_id}@{token}:{cache_buster}
 */
function parse (token) {
    var signer, cacheBuster, templateHash;

    var tokenSplit = token.split(':');

    token = tokenSplit[0];
    if (tokenSplit.length > 1) {
        cacheBuster = tokenSplit[1];
    }

    tokenSplit = token.split('@');
    if (tokenSplit.length > 1) {
        signer = tokenSplit.shift();
        if (tokenSplit.length > 1) {
            templateHash = tokenSplit.shift();
        }
        token = tokenSplit.shift();
    }

    return {
        token: token,
        signer: signer,
        cacheBuster: cacheBuster,
        templateHash: templateHash
    };
}

module.exports.parse = parse;
