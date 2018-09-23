# Lambda Serverless Search

I love elasticsearch. I love serverless functions. But I love serverless functions more because they're cheaper to run. The purpose of this project is to allow the benefits of free text searching but work and scale at the most minimal cost.

The search algorithm powering the system is [lunrjs](http://lunrjs.com).

#### Limitations
Remember, this is a poorman's elastic search. 

- Great for exposing search for sets of new data and existing data
- Can be used to perform autocompletes
- Use as a lite api before migrating to a full scale search solution
- More documents can mean slower performance - how much? I don't know yet. Let me know if you do. 
- AWS Lambda Memory requirements might need to be updated as per dataset
- This is not a database, it is a search service. You will get results with the reference id only, not the entire document.

### AWS Components
- S3	
- Lambda (256mb)
- API Gateway

## Getting Started

You may head over to the [Serverless Application Repository](sss) and deploy the service.

You will have to provide two parameters when you deploy:

`TargetBucket` - The Name of S3 Bucket that should be created, this is where all the documents will sit 
> Note: remember the S3 bucket naming conventions, only lowercase and alphanumberic

`InternalAPIKey` - This API Key is a secret string. Do not share this key with anyone, it will allow you to change your index configuration

You may test the API in postman. Be sure to update the BaseURL. Read below for route docs and design.

[![Run in Postman](https://run.pstmn.io/button.svg)](https://app.getpostman.com/run-collection/c050def4904367e08d45)

After deploying here are somethings you might want to:
- Change the default internal API key
- Add Auth to your routes to restrict access



### Design

![alt text](https://github.com/rlingineni/Lambda-Serverless-Search/blob/master/Architecture.png)


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

##### Input
```javascript
{
    "apikey":"supersecretkey",
	"configs":[
		{
			"name":"movies",
			"fields":["title","year","director","year","genre","tldr"],
			"ref": "id"
		},
		{	"name":"movies-autocomplete",
			"fields":["title","year","director","year","genre","tldr"],
			"ref": "title"
		},
		{	"name":"actors",
			"fields":["name","age","birthplace","alma mater"],
			"ref": "id"
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
Adds a new article to search
`prefix` - prefix may be added to store the data in a different location than `articles`. This is ideal for seperate indexes, or it may be omitted
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
| query parameters |  definition | Example| 
| ------------- | ------------- |---------|
| `q`  | query string to be searched  | `/Prod/search?q=titan&index=ids` |
| `index`  | index to be used | `/Prod/search?q=get&index=autocomplete` |

The default set-up allows for a fuzzy edit distance of two characters. You may tweak the search algorithm [here](https://github.com/rlingineni/Lambda-Serverless-Search/blob/2099d87854b4c7f23eced3214a3141ef66bef95d/document_search/app.js#L173). LunrJS [docs](https://lunrjs.com/guides/searching.html) will also help.
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
### Next Steps, Optimizations and Future

- Add pagination for large sets of results
	- might need a temp cache with correleation-id
- Update to get all S3 Articles via AWS Athena
- For Multiple indexes, support a seperate index file locations away from one large shared folder
- Nightly Batch function to group articles from one day into a large document
- Add Cache to keep track of most popular results in order to dynamically perform result boosts


