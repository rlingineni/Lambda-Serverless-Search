const AWS = require("aws-sdk");
const AWSHelper = require("aws-functions");
const s3 = new AWS.S3();
let BUCKET_NAME, IndexConfig;

exports.lambdaHandler = async (event, context) => {
	BUCKET_NAME = process.env.BUCKET_NAME;

	//fetch previous cache of documents
	let AllArticles = [];

	//fetch every document uploaded to S3 in articles folder
	let listOfDocuments = await AWSHelper.listObjects(BUCKET_NAME, "articles/");
	if (listOfDocuments.length <= 5) {
		console.log("No batching operation needed, too few items");
		return "No need to batch";
	}
	console.log("Got articles list ...");
	let listOfDocumentPromises = [];
	for (var documentName of listOfDocuments) {
		listOfDocumentPromises.push(AWSHelper.getJSONFile(BUCKET_NAME, documentName, true));
	}

	let PromiseResults = await Promise.all(listOfDocumentPromises);
	for (var result of PromiseResults) {
		if (result != null) {
			let isArray = Array.isArray(result);
			if (isArray) {
				AllArticles = AllArticles.concat(result);
			} else {
				AllArticles.push(result);
			}
			//mark for deletion
			await AWSHelper.deleteFromS3(BUCKET_NAME, result.s3key);
		}
	}

	console.log("marked " + AllArticles.length + "articles for deletion");
	if (AllArticles.length > 0) {
		//upload a batched document to S3
		let DocumentName = "batched-" + Date.now();
		console.log("Batched as " + documentName);
		await AWSHelper.uploadToS3(BUCKET_NAME, "articles/" + DocumentName + ".json", JSON.stringify(AllArticles));
	}
};
