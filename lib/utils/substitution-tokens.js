'use strict';

var SUBSTITUTION_TOKENS = {
    bbox: /!bbox!/g,
    scale_denominator: /!scale_denominator!/g,
    pixel_width: /!pixel_width!/g,
    pixel_height: /!pixel_height!/g
};

var SubstitutionTokens = {
    tokens: function(sql) {
        return Object.keys(SUBSTITUTION_TOKENS).filter(function(tokenName) {
            return !!sql.match(SUBSTITUTION_TOKENS[tokenName]);
        });
    },

    hasTokens: function(sql) {
        return this.tokens(sql).length > 0;
    },

    replace: function(sql, replaceValues) {
        Object.keys(replaceValues).forEach(function(token) {
            if (SUBSTITUTION_TOKENS[token]) {
                sql = sql.replace(SUBSTITUTION_TOKENS[token], replaceValues[token]);
            }
        });
        return sql;
    }
};

module.exports = SubstitutionTokens;
