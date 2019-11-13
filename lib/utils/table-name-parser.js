'use strict';

// Quote an PostgreSQL identifier if ncecessary
function quoteIdentifierIfNeeded (txt) {
    if (txt && !txt.match(/^[a-z_][a-z_0-9]*$/)) {
        return '"' + txt.replace(/"/g, '""') + '"';
    } else {
        return txt;
    }
}

// Parse PostgreSQL table name (possibly quoted and with optional schema).+
// Returns { schema: 'schema_name', table: 'tableName' }
function parseTableName (table) {
    function splitAsQuotedParts (tableName) {
        // parse table into 'parts' that may be quoted, each part
        // in the parts array being an object { part: 'text', quoted: false/true }
        var parts = [];
        var splitted = tableName.split(/"/);
        for (var i = 0; i < splitted.length; i++) {
            if (splitted[i] === '') {
                if (parts.length > 0 && i < splitted.length - 1) {
                    i++;
                    parts[parts.length - 1].part += '"' + splitted[i];
                }
            } else {
                var isQuoted = (i > 0 && splitted[i - 1] === '') ||
                         (i < splitted.length - 1 && splitted[i + 1] === '');
                parts.push({ part: splitted[i], quoted: isQuoted });
            }
        }
        return parts;
    }

    var parts = splitAsQuotedParts(table);

    function splitSinglePart (part) {
        var schemaPart = null;
        var tablePart = null;
        if (part.quoted) {
            tablePart = part.part;
        } else {
            var parts = part.part.split('.');
            if (parts.length === 1) {
                schemaPart = null;
                tablePart = parts[0];
            } else if (parts.length === 2) {
                schemaPart = parts[0];
                tablePart = parts[1];
            } // else invalid table name
        }
        return {
            schema: schemaPart,
            table: tablePart
        };
    }

    function splitTwoParts (part1, part2) {
        var schemaPart = null;
        var tablePart = null;
        if (part1.quoted && !part2.quoted) {
            if (part2.part[0] === '.') {
                schemaPart = part1.part;
                tablePart = part2.part.slice(1);
            } // else invalid table name (missing dot)
        } else if (!part1.quoted && part2.quoted) {
            if (part1.part[part1.part.length - 1] === '.') {
                schemaPart = part1.part.slice(0, -1);
                tablePart = part2.part;
            } // else invalid table name (missing dot)
        } // else invalid table name (missing dot)
        return {
            schema: schemaPart,
            table: tablePart
        };
    }

    if (parts.length === 1) {
        return splitSinglePart(parts[0]);
    } else if (parts.length === 2) {
        return splitTwoParts(parts[0], parts[1]);
    } else if (parts.length === 3 && parts[1].part === '.') {
        return {
            schema: parts[0].part,
            table: parts[2].part
        };
    } // else invalid table name
}

function tableIdentifier (parsedName) {
    if (parsedName && parsedName.table) {
        if (parsedName.schema) {
            return quoteIdentifierIfNeeded(parsedName.schema) + '.' + quoteIdentifierIfNeeded(parsedName.table);
        } else {
            return quoteIdentifierIfNeeded(parsedName.table);
        }
    } else {
        return null;
    }
}

module.exports = {
    parse: parseTableName,
    quote: quoteIdentifierIfNeeded,
    table_identifier: tableIdentifier
};
