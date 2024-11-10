import json


def get_images():
    with open('app/static/config/images.json', 'r') as f:
        return json.load(f)