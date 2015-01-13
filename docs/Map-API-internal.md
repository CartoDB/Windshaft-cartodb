# Kind of maps

Windshaft-CartoDB supports the following types of maps:

 - [Temporary maps](#temporary-maps) (created by anyone)
   - [Detached maps](#detached-maps)
   - [Inline maps](#inline-maps) (legacy)
 - [Persistent maps](#peristent-maps) (created by CartDB user)
   - [Template maps](#template-maps)
   - [Table maps](#table-maps) (legacy, deprecated) 

## Temporary maps

Temporary maps have no owners and are anonymous in nature.
There are two kinds of temporary maps:

 - Detached maps (aka MultiLayer-API)
 - Inline maps 

### Detached maps

Detached maps are maps that are configured with a request
obtaining a temporary token and then used by referencing
the obtained token. The token expires automatically when unused.

Anyone can create detached maps, but users will need read access
to the data source of the map layers.

The configuration format is a [MapConfig]
(http://github.com/CartoDB/Windshaft/wiki/MapConfig-specification) document.

The HTTP endpoints for creating the map and using it are described [here]
(http://github.com/CartoDB/Windshaft-cartodb/wiki/MultiLayer-API)

*TODO* cleanup the referenced document

### Inline maps

Inline maps are maps that only exist for a single request,
being the request for a specific map resource (tile).

Inline maps are always bound to a table, and can only be
obtained by those having read access to the that table.
Additionally, users need to have access to any datasource
specified as part of the configuration.

Inline maps only support PNG and UTF8GRID tiles.

The configuration consist in a set of parameters, to be
specified in the query string of the tile request:

 * sql - the query to run as datasource, can be an array
 * style - the CartoCSS style for the datasource, can be an array
 * style_version - version of the CartoCSS style, can be an array
 * interactivity - only for fetching UTF8GRID, 

If the style is not provided, style of the associated table is
used; if the sql is not provided, all records of the associated
table are used as the datasource; the two possibilities result
in a mix between _inline_ maps and [Table maps][].

*TODO* specify (or link) api endpoints

## Persistent maps

Persistent maps can only be created by a CartoDB user who has full
responsibility over editing and deleting them. There are two
kind of persistent maps:

 - Template maps 
 - Table maps (legacy, deprecated) 

### Templated maps

Templated maps are templated [MapConfig]
(http://github.com/CartoDB/Windshaft/wiki/MapConfig-specification) documents
associated with an authorization certificate.

The authorization certificate determines who can instanciate the
template and use the resulting map. Authorized users of the instanciated
maps will have the same database access privilege of the template owner.

The HTTP endpoints for creating and using templated maps are described [here]
(http://github.com/CartoDB/Windshaft-cartodb/wiki/Template-maps).

*TODO* cleanup the referenced document

### Table maps

Table maps are maps associated with a table.
Configuration of such maps is limited to the CartoCSS style.

 * style - the CartoCSS style for the datasource, can be an array
 * style_version - version of the CartoCSS style, can be an array

You can only fetch PNG or UTF8GRID tiles from these maps.

Access method is the same as the one for [Inline maps](#inline-maps)

# Endpoints description 

- **/api/maps/** (same interface than https://github.com/CartoDB/Windshaft/wiki/Multilayer-API)
- **/api/maps/named** (same interface than https://github.com/CartoDB/Windshaft-cartodb/wiki/Template-maps)


NOTE: in case Multilayer-API does not contain this info yet, the
      endpoint for fetching attributes is this:

- **/api/maps/:map_id/:layer_index/attributes/:feature_id** 
   - would return { c: 1, d: 2 }

