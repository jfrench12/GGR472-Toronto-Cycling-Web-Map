# GGR472 Final Project: Toronto Cycling Web Map (Still needs data sources section)
 
This repository contains code for a website for GGR472. Our final project involves active transit in Toronto, specifically cycling. This website will allow stakeholders such as policymakers and the public to analyze the distribution of active transit infrastructure throughout the city, whether the use case is finding areas in need of better service, or finding out how equipped your neighbourhood is for active transit use. 

## Purpose
This web map was created to allow both policymakers and individuals to locate areas throughout the city of Toronto that lack access to active transit support, such as infrastructure. It was designed to be intuitive and useable without the need for comprehensive documentation or instructions within the map itself, allowing users to quickly acclimate to the various features within the map and utilize them to find communities which might require further active transit investment.

## Instructions 
Enable overlay allows users to completely hide the neighbourhood boundaries or hexgrid. Overlay type allows the user to pick between the neighbourhood boundaries or the hexgrid visualization of cycling station distribution. Select a relevant indicator through the 'colour by neighbourhood’ drop down menu. The layer options section allows users to toggle the visibility of the bikeshare stations, service areas, the cycling network, and the legend. The buffer size option allows users to set a manual buffer size for every bikeshare station of any value between 1 and 500 meters, with 0 disabling the buffer function entirely. 

## Key repository contents
- `assets/geojson`: A folder which contains the various geojson files used to create the visualizations within the map.
- `assets/geojson/NeighbourhoodsWithCluster.geojson`: A geojson file which includes various indicators and variables created using ArcGIS Pro and the relevant census data, such as primary mode of commuting in each neighbourhood, income, and car use. 
- `assets/geojson/StationServiceAreas.geojson`: A geojson file which includes walkable service areas created using network analysis in ArcGIS Pro. Includes both 5-minute (400m) and 10 minute (800m) networked buffers.
- `assets/geojson/m-cycling-network.geojson`: A geojson file which includes the cycling network within Toronto.
- `assets/css`: A folder which contains the various CSS files used within each page.
- `assets/css/index.css`: A CSS file for positioning the map interface, layout, style, etc.
- `index.html`: A HTML file to render the map.
- `about.html`: A HTML file to render the about page, which contains information about the map and background on it.
- `contact.html`: A HTML file to render the contact page, which contains information about our group and contact info.
- `contact.html`: A HTML file to render the references page, which includes links to the various sources used.
- `assets/js/index.js`: A JavaScript file that creates and visualizes and hexgrid map based on bike share stations as well as the choropleth maps utilized to display census data, indicators, etc.
- `assets/images`: A folder which contains the various images utilized within the website.
