import json
import os


def get_images():
    github_branch = os.getenv('GITHUB_BRANCH', 'main')
    with open('app/static/config/images.json', 'r') as f:
        images = json.load(f)
    
    # Reemplazar {GITHUB_BRANCH} en las URLs
    for category in images.values():
        for key, url in category.items():
            category[key] = url.replace('{GITHUB_BRANCH}', github_branch)
    
    return images