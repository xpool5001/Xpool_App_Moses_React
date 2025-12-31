import struct
import os

files = ['src/assets/onboarding1.png', 'src/assets/Onboarding2.png', 'src/assets/Onboarding3.png']
base_dir = r'g:/xpool'

for f_path in files:
    full_path = os.path.join(base_dir, f_path)
    if os.path.exists(full_path):
        try:
            with open(full_path, 'rb') as f:
                data = f.read(24)

                if data[:8] == b'\x89PNG\r\n\x1a\n':
                    w, h = struct.unpack('>II', data[16:24])
                    print(f'{f_path}: {w}x{h}')
                else:
                    print(f'{f_path}: Not a valid PNG')
        except Exception as e:
            print(f'{f_path}: Error reading resolution - {e}')
    else:
        print(f'{f_path}: Not found')
