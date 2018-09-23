# Lambda Serverless Search

I love elasticsearch. I love serverless functions. But I love serverless functions more because they're cheaper to run. The purpose of this project is to allow the benefits of free text searching but work and scale at the most minimal cost.

The search algorithm powering the system is [lunrjs](http://lunrjs.com).

### Limitations

Remember, this is a poorman's elastic search. You have to be cautious about the

Things to keep in mind:
- Great for exposing search for sets of new data and existing data (~50,000 records)
- More documents can mean slower performance - how much? I don't know yet. Let me know if you do. 
- AWS Lambda Memory requirements might need to be updated as per dataset
- This is not a database - it is a search service. You will get information on the reference id only.

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

You may use this [postman collection](Postman) and test the API routes. Make sure to change the URL. Read below for route docs and design.

## API Routes

After you deploy, you will end up with a base URL:

`https://${myapi}.execute-api.amazonaws.com/Prod/`

-------------------
### POST /internal/config
Creates an Index for the documents. You may update this whenever you want to.


| body parameters |  definition | 
| ------------- | ------------- |
| `apikey`  | An Internal Auth String to only let people with access make a request. Keep this secret, don't make this request from a client  | 
| `fields`  | Array of strings with the name of attributes that are to be indexed in document| 
| `ref`  | The ref is one field that will be returned. Most people use an ID, that they can later lookup|


##### Input
```javascript
{
    	"apikey":"supersecretkey",
	"fields":["title","year","director","year","genre","tldr"],
	"ref": "id"
}
```
##### Response
```
{
	"msg":"Document Uploaded!"
}
```
-------------------

### POST /add
Adds a new document to search
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
	"msg":"Document Uploaded!"
}
```

-------------------

### GET /search
Searches all the documents 

##### Input
| query parameters |  definition | Example| 
| ------------- | ------------- |---------|
| `q`  | query string to be searched  | `/Prod/search?q=titan` |

The default set-up allows for a fuzzy edit distance of two characters. You may tweak the algorithm [here] (https://github.com/rlingineni/Lambda-Serverless-Search/blob/2099d87854b4c7f23eced3214a3141ef66bef95d/document_search/app.js#L173). LunrJS [docs](https://lunrjs.com/guides/searching.html) will also help.
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

### Next Steps and Optimizations
- Change the default internal API key
- Add Auth to your routes to restrict access
- Update to get all S3 Articles via AWS Athena
- Nightly Batch function to group documents from one day into one large document


### Design

![alt text](https://github.com/rlingineni/Lambda-Serverless-Search/blob/master/Architecture.png)

