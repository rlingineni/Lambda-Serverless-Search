const AWS = require("aws-sdk");
const s3 = new AWS.S3();
let BUCKET_NAME, IndexConfig;

exports.lambdaHandler = async (event, context) => {
	BUCKET_NAME = process.env.BUCKET_NAME;

	//fetch previous cache of documents
	let AllArticles = [];

	//fetch every document uploaded to S3 in articles folder
	let listOfDocuments = await listObjects(BUCKET_NAME, "articles/");
	console.log("Got articles list ...");
	let listOfDocumentPromises = [];
	for (var documentName of listOfDocuments) {
		listOfDocumentPromises.push(getJSONFile(BUCKET_NAME, documentName, true));
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
			await deleteFromS3(BUCKET_NAME, result.s3key);
		}
	}

	console.log("marked " + AllArticles.length + "articles for deletion");

	//upload a batched document to S3
	let DocumentName = "batched-" + Date.now();
	await uploadToS3(BUCKET_NAME, "articles/" + DocumentName + ".json", JSON.stringify(AllArticles));
};

async function listObjects(Bucket, Prefix) {
	let params = {
		Bucket,
		Prefix,
		MaxKeys: 1000
	};

	let results = [];
	let isTruncated = true;

	try {
		while (isTruncated) {
			//fetch list of all incoming folders
			let data = await s3.listObjectsV2(params).promise();
			isTruncated = data.IsTruncated;
			for (let item of data.Contents) {
				results.push(item.Key);
			}
			params.ContinuationToken = data.NextContinuationToken;
		}
	} catch (e) {
		throw e;
	}

	return results;
}

async function uploadToS3(Bucket, Key, Body) {
	//add to S3 Bucket
	var params = {
		Bucket,
		Key,
		Body
	};
	try {
		var putObjectPromise = await s3.putObject(params).promise();
		return "Uploaded Object!";
	} catch (err) {
		console.log(err.code);
		console.log("Uploading document failed ...");
		return null;
	}
}

async function getJSONFile(Bucket, Key, returnKeyName) {
	//fetch previous cache of documents
	try {
		var params = {
			Bucket,
			Key
		};
		let data = await s3.getObject(params).promise();
		let resp = JSON.parse(data.Body);
		if (returnKeyName) {
			resp.s3key = Key;
		}
		return resp;
	} catch (err) {
		console.log(err.message);
		console.log("Object does not exist...for ", Key);
		return null;
	}
}

async function deleteFromS3(Bucket, Key) {
	//add to S3 Bucket
	var params = {
		Bucket,
		Key
	};
	try {
		var putObjectPromise = await s3.deleteObject(params).promise();
		return "Deleted Object!";
	} catch (err) {
		console.log(err.code);
		console.log("Deleting document failed ...");
		return null;
	}
}
