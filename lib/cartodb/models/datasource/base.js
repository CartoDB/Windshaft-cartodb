'use strict';

var OverviewsQueryRewriter = require('../../utils/overviews_query_rewriter');

var overviewsQueryRewriter = new OverviewsQueryRewriter({
    zoom_level: 'CDB_ZoomFromScale(!scale_denominator!)'
});


function Datasource() {
}

module.exports = Datasource;

Datasource.prototype.id = function() {
    throw new Error('Missing method `id`');
};

Datasource.prototype.getLayerQuery = function(filters) {
    if (this.layer) {
        var sqlQueryWrap = this.layer.options.sql_wrap;
        if (sqlQueryWrap) {
            return sqlQueryWrap.replace(/<%=\s*sql\s*%>/g, this.getQuery(filters));
        }

        return overviewsQueryRewriter.query(this.getQuery(filters), this.layer.options.query_rewrite_data);
    }

    return this.getQuery(filters);
};

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


// -------------------------- turbo-carto interface --------------------------

Datasource.prototype.getName = function() {
    throw new Error('Missing method `getName`');
};

Datasource.prototype.getRamp = function(column, buckets, method, callback) {
    return callback(new Error('Missing method `getRamp`'));
};

// --------------------------- Dataviews interface ---------------------------
