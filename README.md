# [politics-2016](http://radekstepan.com/politics-2016)

Fetches historical and current betting odds for each US presidential candidate and visualizes them as a perceived probability of the candidate winning (median and q1-q3 values). Event highlights are included too.

![image](https://raw.githubusercontent.com/radekstepan/politics-2016/master/screencap.gif)

## Quickstart

```bash
$ nvm use
$ npm install
$ make start
# politics-2016/0.0.2 started on port 8080
```

To update the odds, pipe an NDJSON list of candidates into the following bin file:

```bash
$ cat ./data/candidates.json | ./bin/data.js
```
