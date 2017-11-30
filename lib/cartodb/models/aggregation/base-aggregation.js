module.exports = class BaseAggregation {
    sql () {
        throw new Error('Unimplemented method');
    }
};

module.exports.baseQueryTemplate = ctx => `
    select ${ctx} blah.., blah, blah...
`;
