# Satellite imagery provenance

Last reviewed: 2026-09-26.

## Source selected

The adjacent NOCLIP Earth repository declares Satellite in:

`/home/roko/Documents/Projects/Adjacent/noclip-unified/earth/refactor/imagery/builtin-basemaps.js`

Its canonical registry record is:

- ID: `esri-world-imagery`
- Provider endpoint: `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`
- Native display attribution in Earth: `Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics`
- Maximum requested zoom: 19
- Tile size: 256

This repository uses that exact endpoint only through the bounded `/map/satellite/:z/:x/:y.jpg` relay. It does not bulk download, pre-seed, archive, analyze, or derive data from the imagery.

## Public references and obligations

- [Esri web site and service terms](https://www.esri.com/en-us/legal/terms/web-site-service) require proper attribution and distinguish commercial use.
- [Esri basemap citation guidance](https://support.esri.com/en-us/knowledge-base/what-is-the-correct-way-to-cite-an-arcgis-online-basema-000012040) says public exhibition attribution belongs on the map or image.
- [Esri World Imagery documentation](https://doc.arcgis.com/en/data-appliance/2023/maps/world-imagery.htm) identifies the imagery sources and Web Mercator tile contract.

The app displays attribution in MapLibre and in the layer control. This is a technical integration example, not a grant of commercial imagery rights. Before the demo is monetized, bundled into a paid customer product, or used beyond interactive viewing, the operator must confirm an appropriate Esri commercial license or replace the source with imagery whose license covers that use.

## Change procedure

When changing the imagery source, update the server allowlist, MapLibre source, visible attribution, this provenance record, tests, and deployment smoke check in the same commit.
