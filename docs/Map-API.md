# Maps API

The CARTO Maps API allows you to generate maps based on data hosted in your CARTO account and apply custom SQL and CartoCSS to the data. The API generates a XYZ-based URL to fetch Web Mercator projected tiles, using web clients such as [Leaflet](http://leafletjs.com), [Google Maps](https://developers.google.com/maps/), or [OpenLayers](http://openlayers.org/).

You can create two types of maps with the Maps API:

- **Anonymous Maps**  
  You can create maps using your CARTO public data. Any client can change the read-only SQL and CartoCSS parameters that generate the map tiles. These maps can be created from a JavaScript application alone and no authenticated calls are needed. See [this CARTO.js example](/carto-engine/carto-js/getting-started/).

- **Named Maps**  
  There are also maps that have access to your private data. These maps require an owner to setup and modify any SQL and CartoCSS parameters and are not modifiable without new setup calls.

## Documentation

* [Quickstart](quickstart.md)
* [General Concepts](general_concepts.md)
* [Anonymous Maps](anonymous_maps.md)
* [Named Maps](named_maps.md)
* [Static Maps API](static_maps_api.md)
