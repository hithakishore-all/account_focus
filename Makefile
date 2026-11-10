# Account Focus · common tasks. Run from the repo root.
.PHONY: install offline test data video demo

install:        ## install app dependencies
	cd app && npm ci

offline:        ## run the console offline at http://127.0.0.1:3200
	cd app && npm run offline

test:           ## run all tests
	cd app && npm test

data:           ## regenerate seed data and every generated file
	python3 data/generate_data.py
	cd app && npm run fixtures && npm run engine-sql && npm run demo

video:          ## re-record the captioned walkthrough (needs Python Playwright and ffmpeg)
	python3 scripts/video/record.py
	cp scripts/video/out/chapters.json docs/video/chapters.json
	cd app && npm run demo

demo:           ## rebuild demo/index.html
	cd app && npm run demo
