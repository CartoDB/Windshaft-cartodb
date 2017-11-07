#!/usr/bin/env python

import mapbox_vector_tile

lines_list = []

# main diagonal line
lines_list.append({ "geometry":"LINESTRING (0 0, 4096 4096)"})

# diagonal lines 
for i in range(4096/32, 4096, 4096/32):
    start = i
    end = 4096 - i
    
    lines_list.append({ "geometry":"LINESTRING (0 " + str(start) + ", " + str(end) + " 4096)" })
    lines_list.append({ "geometry":"LINESTRING (" + str(start) + " 0, 4096 " + str(end) + ")" })

# box lines
lines_list.append({ "geometry":"LINESTRING (0 0, 0 4096)"})
lines_list.append({ "geometry":"LINESTRING (0 4096, 4096 4096)"})
lines_list.append({ "geometry":"LINESTRING (4096 4096, 4096 0)"})
lines_list.append({ "geometry":"LINESTRING (4096 0, 0 0)"})


tile = mapbox_vector_tile.encode([
    {
        "name": "errorTileSquareLayer",
        "features": [{ "geometry":"POLYGON ((0 0, 0 4096, 4096 4096, 4096 0, 0 0))" }]
    },
    {
        "name": "errorTileStripesLayer",
        "features": lines_list
    }
])

with open('./assets/render-timeout-fallback.mvt', 'w+') as f:
    f.write(tile)