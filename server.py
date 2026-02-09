from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import subprocess
import tempfile
import os
import time
import uuid
import json
import re

app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)

DUMPER_PATH = os.path.join(os.path.dirname(__file__), 'dumper.lua')
MAX_CODE_SIZE = 5 * 1024 * 1024  # 5MB
MAX_CONCURRENT = 10
current_jobs = 0

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory(app.static_folder, path)

@app.route('/api/deobfuscate', methods=['POST'])
def deobfuscate():
    global current_jobs
    
    if current_jobs >= MAX_CONCURRENT:
        return jsonify({
            'success': False,
            'error': 'Server busy, try again later'
        }), 429
    
    data = request.json
    code = data.get('code', '')
    key = data.get('key', '')
    place_id = data.get('placeId', 123456789)
    timeout = min(data.get('timeout', 30), 120)  # Max 120s
    
    if not code:
        return jsonify({
            'success': False,
            'error': 'No code provided'
        }), 400
    
    if len(code) > MAX_CODE_SIZE:
        return jsonify({
            'success': False,
            'error': f'Code too large (max {MAX_CODE_SIZE // 1024 // 1024}MB)'
        }), 400
    
    # Create temp files
    job_id = str(uuid.uuid4())[:8]
    input_file = os.path.join(tempfile.gettempdir(), f'dumper_input_{job_id}.lua')
    output_file = os.path.join(tempfile.gettempdir(), f'dumper_output_{job_id}.lua')
    
    current_jobs += 1
    
    try:
        # Write input
        with open(input_file, 'w', encoding='utf-8') as f:
            f.write(code)
        
        # Run dumper
        cmd = ['lua', DUMPER_PATH, input_file, output_file]
        if key:
            cmd.append(key)
        if place_id:
            cmd.append(str(place_id))
        
        start_time = time.time()
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=os.path.dirname(DUMPER_PATH)
        )
        
        elapsed = time.time() - start_time
        
        # Read output
        output = ''
        if os.path.exists(output_file):
            with open(output_file, 'r', encoding='utf-8', errors='replace') as f:
                output = f.read()
        
        if not output and result.stdout:
            output = result.stdout
        
        # Extract useful data
        urls = extract_urls(output)
        remotes = extract_remotes(output)
        strings = extract_suspicious_strings(output)
        
        # Count stats
        lines = output.count('\n') + 1 if output else 0
        
        return jsonify({
            'success': bool(output),
            'output': output or '-- No output generated\n-- ' + (result.stderr or 'Unknown error'),
            'stats': {
                'total_lines': lines,
                'remote_calls': len(remotes),
                'suspicious_strings': len(strings),
                'elapsed': round(elapsed, 2)
            },
            'urls': urls,
            'remotes': remotes,
            'strings': strings
        })
        
    except subprocess.TimeoutExpired:
        return jsonify({
            'success': False,
            'error': f'Timeout after {timeout}s',
            'details': 'Script took too long. Try increasing timeout or simplifying input.'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
    finally:
        current_jobs -= 1
        # Cleanup
        for f in [input_file, output_file]:
            try:
                os.remove(f)
            except:
                pass


def extract_urls(text):
    """Extract URLs from output"""
    if not text:
        return []
    pattern = r'https?://[^\s"\'\)>\]\}]+'
    urls = list(set(re.findall(pattern, text)))
    return urls[:50]  # Limit


def extract_remotes(text):
    """Extract remote calls"""
    if not text:
        return []
    patterns = [
        r'(\w+):FireServer\([^)]*\)',
        r'(\w+):InvokeServer\([^)]*\)',
        r'OnClientEvent',
        r'OnServerEvent'
    ]
    remotes = []
    for p in patterns:
        matches = re.findall(p, text)
        remotes.extend(matches)
    return list(set(remotes))[:50]


def extract_suspicious_strings(text):
    """Extract suspicious strings"""
    if not text:
        return []
    suspicious = []
    
    # Discord webhooks
    webhooks = re.findall(r'discord\.com/api/webhooks/[^\s"\']+', text)
    suspicious.extend(['https://' + w for w in webhooks])
    
    # Base64
    b64 = re.findall(r'[A-Za-z0-9+/]{40,}={0,2}', text)
    for b in b64[:5]:
        suspicious.append(f'[Base64] {b[:60]}...')
    
    # API keys looking strings
    keys = re.findall(r'["\']([a-zA-Z0-9_-]{32,})["\']', text)
    for k in keys[:5]:
        suspicious.append(f'[Key?] {k[:60]}...')
    
    return list(set(suspicious))[:30]


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'jobs': current_jobs,
        'max_jobs': MAX_CONCURRENT
    })


if __name__ == '__main__':
    print("Sourcer Deobfuscator Server")
    print(f"Dumper: {DUMPER_PATH}")
    print(f"Exists: {os.path.exists(DUMPER_PATH)}")
    app.run(host='0.0.0.0', port=5000, debug=True)
