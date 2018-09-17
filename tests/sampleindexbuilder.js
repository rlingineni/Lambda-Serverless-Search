const fs = require("fs");
//const elasticlunr = require("elasticlunr");
const elasticlunr = require("lunr");

const loadFromIndex = false;
console.time();

if (!loadFromIndex) {
	// First I want to read the file
	fs.readFile("./movies.json", function read(err, data) {
		if (err) {
			throw err;
		}

		let listOfMovies = JSON.parse(data);
		console.log(listOfMovies.length);
		generateSearchIndex(listOfMovies);
	});
} else {
	fs.readFile("./movies_index.json", function read(err, data) {
		if (err) {
			throw err;
		}
		var indexDump = JSON.parse(data);
		let index = elasticlunr.Index.load(indexDump);
		console.log(index.search("Spielberg"));
		console.timeEnd();
	});
}

function generateSearchIndex(listOfMovies) {
	var index = elasticlunr(function() {
		this.field("title");
		this.field("director");
		this.field("year");
		this.ref("id");

		listOfMovies.forEach(function(movie) {
			movie.id = Date.now();
			this.add(movie);
		}, this);
	});

	let searchTerm = "spiel";

	/*console.log(
		index.query(function(q) {
			// exact matches should have the highest boost
			q.term(searchTerm, { boost: 100 });

			// prefix matches should be boosted slightly
			q.term(searchTerm, { boost: 10, usePipeline: false, wildcard: elasticlunr.Query.wildcard.TRAILING });

			// finally, try a fuzzy search, without any boost
			q.term(searchTerm, { boost: 1, usePipeline: false, editDistance: 1 });
		})
	);*/

	console.log(index.search("s"));
	console.timeEnd();
	fs.writeFile("./movies_index.json", JSON.stringify(index), function(err) {
		if (err) throw err;
		console.log("done writing index");
	});
}
