Some helpful commands for reference when building and deploying:

Package

```
sam package --template template.yaml --output-template packaged.yaml --s3-bucket raviserverlessrepo
```

Deploy

```
sam deploy --template-file ./packaged.yaml --stack-name myserverlesssearchstack--capabilities CAPABILITY_IAM --parameter-overrides TargetBucket=serverless-search-demo
```
