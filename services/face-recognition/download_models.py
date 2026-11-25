"""Fetch the exact OpenCV Zoo revision and verify its Git LFS SHA256."""
import base64
import json
import hashlib
import os
from pathlib import Path
import re
import urllib.request
REVISION = '48b10fa505aeb51fbd127fc60a5c660040e823b7'
ROOT = Path(__file__).parent / 'models'
FILES = {
    'yunet.onnx': 'face_detection_yunet/face_detection_yunet_2023mar.onnx',
    'sface.onnx': 'face_recognition_sface/face_recognition_sface_2021dec.onnx',
}
def source(path):
    headers = {'User-Agent': 'REV-attendance-model-builder'}
    if os.environ.get('GH_TOKEN'):
        headers['Authorization'] = f"Bearer {os.environ['GH_TOKEN']}"
    req = urllib.request.Request(f'https://api.github.com/repos/opencv/opencv_zoo/contents/models/{path}?ref={REVISION}', headers=headers)
    data = json.loads(urllib.request.urlopen(req, timeout=20).read())
    return base64.b64decode(data['content'])

def download():
    ROOT.mkdir(exist_ok=True)
    for name, path in FILES.items():
        base = f'https://raw.githubusercontent.com/opencv/opencv_zoo/{REVISION}/models/'
        pointer = source(path).decode()
        expected = re.search(r'oid sha256:([0-9a-f]{64})', pointer).group(1)
        target = ROOT / name
        if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest() != expected:
            content = urllib.request.urlopen(f'https://media.githubusercontent.com/media/opencv/opencv_zoo/{REVISION}/models/{path}', timeout=120).read()
            if hashlib.sha256(content).hexdigest() != expected:
                raise RuntimeError('Model checksum mismatch')
            target.write_bytes(content)
        license_path = ROOT / (name + '.LICENSE')
        license_path.write_bytes(source(path.rsplit('/', 1)[0] + '/LICENSE'))
        print(f'{name}: SHA256 verified')
if __name__ == '__main__':
    download()
