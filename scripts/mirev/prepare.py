"""Build a clean Railway upload folder for an independent MiREV service."""
import argparse
import json
import shutil
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('service', choices=['api', 'web'])
parser.add_argument('--output', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
out = Path(args.output).resolve()
if out.exists():
    raise SystemExit('Use a new, empty output path.')
out.mkdir(parents=True)
for name in ['package.json', 'package-lock.json']:
    shutil.copyfile(root / name, out / name)
other = 'web' if args.service == 'api' else 'api'
(out / 'apps' / other).mkdir(parents=True)
shutil.copyfile(root / 'apps' / other / 'package.json', out / 'apps' / other / 'package.json')
shutil.copytree(root / 'apps' / args.service, out / 'apps' / args.service,
                ignore=shutil.ignore_patterns('node_modules', 'dist', '.next', '.env*', '*.tsbuildinfo'))
shutil.copyfile(root / 'deploy' / 'mirev' / f'Dockerfile.{args.service}', out / 'Dockerfile')
(out / 'railway.json').write_text(json.dumps({
    'build': {'builder': 'DOCKERFILE', 'dockerfilePath': 'Dockerfile'},
    'deploy': {'healthcheckPath': '/health' if args.service == 'api' else '/attendance/mobile',
               'healthcheckTimeout': 120, 'restartPolicyType': 'ON_FAILURE'}
}) + '\n')
print(out)
