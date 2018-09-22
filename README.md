# Lambda Serverless Search

I love elasticsearch. I love serverless functions. But I love serverless functions more because they're cheaper to run. The purpose of this project is to allow the benefits of free text searching but work and scale at the most minimal cost.

The search algorithm powering the system is [lunrjs](http://lunrjs.com).

## Components
- API Gateway
- S3 Bucket
- DynamoDB

There were a few 


## Getting Started

You may head over to the [Serverless Application Repository](sss) now and deploy the service.

You will have to provide two parameters:

`TargetBucket` - The Name of S3 Bucket that should be created, this is where all the documents will sit 
    Note: (remember the S3 naming conventions, only lowercase and alphanumberic)

`InternalAPIKey` - This API Key is a secret string that will allow you to perform updating the index. Do not share this key with anyone


### API Routes



### /search
Searches all the documents


| API Route  |  What it does | Input| 
| ------------- | ------------- |---------|
| `\search`  | Content Cell  |
| `\internal\config`  | Content Cell  |


You may use this [postman collection](Postman) and set up your API routes.

### Things you may want to do
- Open API Gateway and make add auth to your routes
- 


