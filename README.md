# Lambda Serverless Search

I love elasticsearch. I love serverless functions. But I love serverless functions more because they're cheaper to run. The purpose of this project is to allow the benefits of free text searching but work and scale at the most minimal cost.

The search algorithm powering the system is [lunrjs](http://lunrjs.com).

#### Limitations
Remember, this is a poorman's elastic search. 

- Great for exposing search for sets of new data and existing data
- You only get the index id, not the entire document
- Use as a lite api before migrating to a full scale search solution
- More documents can mean slower performance - how much? Below I've noted my [performance](#performance) observations
- AWS Lambda Memory requirements might need to be updated as per dataset
- This is not a database, it is a search service. You will get results with the reference id only, not the entire document.

### AWS Components
- S3	
- Lambda (256mb)
- API Gateway

## Getting Started

You may head over to the [Serverless Application Repository](https://serverlessrepo.aws.amazon.com/#/applications/arn:aws:serverlessrepo:us-east-1:939884077921:applications~serverless-search) and deploy the service.

You will have to provide two parameters when you deploy:

`TargetBucket` - The Name of S3 Bucket that should be created, this is where all the documents will sit 
> Note: remember the S3 bucket naming conventions, only lowercase and alphanumberic

`InternalAPIKey` - This API Key is a secret string. Do not share this key with anyone, it will allow you to change your index configuration

You may test the API in postman. Be sure to update the BaseURL. Read below for route docs and design.

[![Run in Postman](https://run.pstmn.io/button.svg)](https://app.getpostman.com/run-collection/1e7621630073333b2697)

After deploying here are somethings you might want to:
- Change the default internal API key
- Add Auth to your routes to restrict access


### Design

![alt text](https://github.com/rlingineni/Lambda-Serverless-Search/blob/master/imgs/Architecture.png)

## API Routes

After you deploy, you will end up with a base URL:

`https://${myapi}.execute-api.amazonaws.com/Prod/`

-------------------
### POST /internal/config
Creates an Index(s) for the articles. You may update this whenever you want to. 


| body parameters |  definition | 
| ------------- | ------------- |
| `apikey`  | An Internal Auth String to only let people with access make a request. Keep this secret, don't make this request from a client  | 
| `config`  | Array of index config objects. See below table| 

**Config Body**

| body parameters |  definition | required|
| ------------- | ------------- |------------- 
| `fields`  | Array of strings with the name of attributes that are to be indexed in document| `yes`|
| `name`  | The name of the index| `yes`|
| `ref`  | The ref is one field that will be returned. Most people use an ID, that they can later lookup in a DB or other store|`yes`|
| `shards`  |This value sets the number of records per index. If individual documents are large in size, then you want smaller shards. By default, an index is sharded at 2000 shards |`no`|

##### Input
```javascript
{
    "apikey":"supersecretkey",
	"configs":[
		{
			"name":"movies",
			"fields":["title","year","director","year","genre","tldr"],
			"ref": "id",
			"shards": 1000
		},
		{	"name":"movies-title",
			"fields":["title","year","director","year","genre","tldr"],
			"ref": "title"
		}
	]
	
}
```
##### Response
```
{
	"msg":"Index Config Updated"
}
```
-------------------

### POST /add
Adds a new article to search, you may upload either an array, or a single object
##### Input
```javascript
 [
	    {           
		"id":"112233",
		"title": "Titanic",
		"year": 1997,
		"director": "Steven Spielberg",
		"genre": "Romance",
		"tldr": "An Amazing love story"
	    },
	    {           
		"id":"115566",
		"title": "Shawshank Redemption",
		"year": 1994,
		"director": "Frank Darabont",
		"genre": "Misc.",
		"tldr": "Story of friendship"
	    }
	
]
```
##### Response
```
{
	"msg":"Article Added"
}
```

-------------------

### GET /search
Searches all the articles

##### Input
| query parameters |required|  definition | Example| 
| ------------- | ------------- |---------|------|
| `q`  |yes |query string to be searched  | `/Prod/search?q=titan&index=movies` |
| `index`  | yes|index to be used | `/Prod/search?q=get&index=movies` |
| `count`  | no|count of search result to return. **Default:** 25 | `/Prod/search?q=get&index=movies&count=50` |

Both parameters are required.

You may tweak the search algorithm [here](https://github.com/rlingineni/Lambda-Serverless-Search/blob/2099d87854b4c7f23eced3214a3141ef66bef95d/document_search/app.js#L173). LunrJS [docs](https://lunrjs.com/guides/searching.html) will also help.
##### Response
```
    [
        {
            "ref": "112233",
            "score": 1.992,
            "matchData": {
                "metadata": {
                    "titan": {
                        "title": {}
                    }
                }
            }
        }
    ]
```

-------------------

### GET /internal/config
Return the schema that is being used to index the documents

##### Response
```
    {
    	"fields":["title","year","director","year","genre","tldr"],
	"ref": "id"
    }
```

-------------------
## Performance 
Here are some graphs on performance that I have done. It's not going to win any races, or even come close to algolia or elasticsearch. The real killer is network latency which is a non-negotiable ~2s depending on the index size. There might be a better way to query it with Athena that might speed things along.

![alt text](https://github.com/rlingineni/Lambda-Serverless-Search/blob/master/imgs/indexing-latency.png)

Lambda memory allocation has a huge impact!

![alt text](https://github.com/rlingineni/Lambda-Serverless-Search/blob/master/imgs/query-latency.png)

### DocumentSearchFunction:
- All search indexes are loaded in parallel to improve concurrency
- The higher the memory for a Lambda function, the more the compute power, hence faster index searching. (you can see up to  **75% increase** in speed), just adjust the slider.

### DocumentIndexingFunction:
- The lower the number of *individual* articles, the faster the indexing time
- You may see my `scale test` folder in the code above. It checks how long it takes to see a record appear in the results after it's uploaded. Latency of indexing operations degrades to about 30X over the course of 12K records. 
- Bulk uploads tend to decrease the amount of time
- The higher the memory for a Lambda function, the more the compute power, hence faster index building
	
	

### Next Steps, Optimizations and Future

- Add pagination for large sets of results
- Upload Index directly to the Lambda Function (this would radically improve performance)
- Update to get all S3 Articles and Content via AWS Athena
- Use Cloudfront with S3 to cache the index document
- Add Cache to keep track of most popular results in order to dynamically perform result boosts


