'use strict';

function Datasource() {
    var id = JSON.stringify(Array.apply(null, arguments));
    this.id = function() {
        return id;
    };
}

module.exports = Datasource;

Datasource.prototype.getQuery = function() {
    throw new Error('Missing method `getQuery`');
};

Datasource.prototype.getRamp = function() {
    throw new Error('Missing method `getRamp`');
};

// Workaround for dataviews + overviews.
// This should not exist, we will be able to remove it when overviews follow this datasource pattern.
Datasource.prototype.getType = function() {
    throw new Error('Missing method `getType`');
};

Datasource.prototype.getFilters = function() {
    throw new Error('Missing method `getFilters`');
};

Datasource.prototype.getAffectedTables = function() {
    throw new Error('Missing method `getAffectedTables`');
};

Datasource.prototype.getMetadata = function() {
    throw new Error('Missing method `getMetadata`');
};
