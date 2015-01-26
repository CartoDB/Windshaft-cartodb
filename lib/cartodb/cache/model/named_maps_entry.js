var crypto = require('crypto');

function NamedMaps(owner, name) {
    this.namespace = 'n';
    this.owner = owner;
    this.name = name;
}

module.exports = NamedMaps;


NamedMaps.prototype.key = function() {
    return this.namespace + ':' + shortHashKey(this.owner + ':' + this.name);
};

function shortHashKey(target) {
    return crypto.createHash('sha256').update(target).digest('base64').substring(0,6);
}
