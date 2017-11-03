#!/usr/bin/env python

import mapbox_vector_tile

tile = mapbox_vector_tile.encode([
    {
        "name": "errorTileSquareLayer",
        "features": [{
            "geometry":"POLYGON ((0 0, 0 4096, 4096 4096, 4096 0, 0 0))",
            "properties":{
                "uid":123,
                "foo":"bar",
                "cat":"flew"
            }
        }]
    },
    {
        "name": "air",
        "features": [{
            "geometry":"LINESTRING(159 3877, -1570 3877)",
            "properties":{
                "uid":1234,
                "foo":"bar",
                "cat":"flew"
            }
        }]
    }
])

with open('./assets/render-timeout-fallback.mvt', 'w+') as f:
    f.write(repr(tile))