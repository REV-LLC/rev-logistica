"""Run: FACE_TEST_IMAGE=/path/to/test-face.jpg python -m unittest test_app.py"""
import os
os.environ.setdefault('FACE_SERVICE_TOKEN', 'test-only-token-000000000000000000000000')
import unittest
from unittest.mock import patch
from pathlib import Path
import cv2
import numpy as np
from fastapi.testclient import TestClient
from app import app

class FaceApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.headers = {'Authorization': 'Bearer ' + os.environ['FACE_SERVICE_TOKEN']}
    def post(self, content):
        return self.client.post('/extract', headers=self.headers, files={'image': ('test.jpg', content)})
    def test_health_and_authentication(self):
        self.assertTrue(self.client.get('/health').json()['ok'])
        self.assertEqual(self.client.post('/extract', files={'image': ('test.jpg', b'invalid')}).status_code, 401)
    def test_invalid_and_empty_faces(self):
        self.assertEqual(self.post(b'invalid').status_code, 422)
        _, blank = cv2.imencode('.jpg', np.zeros((300, 300, 3), dtype=np.uint8))
        response = self.post(blank.tobytes())
        self.assertEqual(response.status_code, 422)
        self.assertIn('No pudimos detectar tu rostro', response.json()['detail'])
    def test_empty_detection_array_is_not_reported_as_multiple_faces(self):
        _, blank = cv2.imencode('.jpg', np.zeros((300, 300, 3), dtype=np.uint8))
        with patch('app.detector') as detector:
            detector.detect.return_value = (None, np.empty((0, 15)))
            response = self.post(blank.tobytes())
        self.assertEqual(response.status_code, 422)
        self.assertIn('No pudimos detectar tu rostro', response.json()['detail'])
    @unittest.skipUnless(os.environ.get('FACE_TEST_IMAGE'), 'Set FACE_TEST_IMAGE for real model checks')
    def test_real_face_embedding_and_multiple_faces(self):
        image = Path(os.environ['FACE_TEST_IMAGE']).read_bytes()
        result = self.post(image)
        self.assertEqual(result.status_code, 200, result.text)
        vector = np.array(result.json()['vector'])
        self.assertEqual(vector.shape, (128,))
        self.assertAlmostEqual(np.linalg.norm(vector), 1, places=5)
        frame = cv2.imdecode(np.frombuffer(image, dtype=np.uint8), cv2.IMREAD_COLOR)
        _, multiple = cv2.imencode('.jpg', cv2.hconcat([frame, frame]))
        response = self.post(multiple.tobytes())
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()['detail'], 'Detectamos 2 rostros en la foto. Debe aparecer únicamente tu cara.')
