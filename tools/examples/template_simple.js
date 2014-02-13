{
 "version":"0.0.1",
 "name":"simple",
 "placeholders":{},
 "auth":{ "method":"open" },
 "layergroup":{
   "version":"1.0.1",
    "layers":[{
      "type":"cartodb",
      "options":{
        "sql":"select ST_SetSRID(ST_MakePoint(0,0),3857) as the_geom_webmercator",
        "cartocss":"#s{ marker-width: 12;}",
        "cartocss_version":"2.1.1"
      }
    }]
  }
}
