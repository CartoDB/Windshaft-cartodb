CREATE TABLE IF NOT EXISTS
    cartodb.special_column_names (
    the_geom geometry(Geometry,4326),
    cartodb_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    the_geom_webmercator geometry(Geometry,3857),
    "window" text,
    " $/." text
);

GRANT ALL ON TABLE cartodb.special_column_names TO :TESTUSER;

COPY cartodb.special_column_names (the_geom, cartodb_id, "window", " $/.", created_at, updated_at, the_geom_webmercator) FROM stdin;
0101000020E610000098A6C484115F4440D0403774DFA74240	1109	window	dollar	2014-08-08 18:09:46.402744+02	2014-08-08 18:09:46.402744+02	0101000020110F0000CA9128C5284D5141C660EC0D8E195141
\.
