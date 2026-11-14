"""Bounded real codec and header/frame contract for manual voxel tools."""
import gzip
import unittest
from skullfix_ai.application.binary_nrrd import decode_binary_nrrd, verify_header_spatial, VoxelError

class BinaryNrrdTest(unittest.TestCase):
    def test_raw_and_gzip_preserve_header_grid_and_exact_voxels(self):
        for encoding in ('raw','gzip'):
            header=('NRRD0005\ntype: uint8\ndimension: 3\nsizes: 2 2 1\nencoding: '+encoding+'\n\n').encode()
            payload=bytes([1,0,1,0])
            grid=decode_binary_nrrd(header+(gzip.compress(payload) if encoding=='gzip' else payload))
            self.assertEqual(grid.sizes,(2,2,1));self.assertEqual(grid.voxels,payload)
            self.assertEqual(decode_binary_nrrd(grid.encode(bytes([0,1,0,1]))).voxels,bytes([0,1,0,1]))
    def test_invalid_type_encoding_size_binary_payload_and_spatial_header_are_explicit(self):
        header=b'NRRD0005\ntype: uint8\ndimension: 3\nsizes: 2 2 1\nencoding: raw\n\n'
        for data in [header+bytes([0,2,0,0]),header+bytes(3),header.replace(b'uint8',b'uint16')+bytes(4),header.replace(b'encoding: raw',b'encoding: ascii')+bytes(4),header.replace(b'2 2 1',b'536870912 1 1')]:
            with self.assertRaises(VoxelError):decode_binary_nrrd(data)
        physical=header.replace(b'encoding: raw',b'space origin: (10,0,0)\nencoding: raw')+bytes(4)
        grid=decode_binary_nrrd(physical)
        with self.assertRaisesRegex(VoxelError,'origin'):verify_header_spatial(grid,{'spaceOrigin':[0,0,0],'spacings':[1,1,1]})

if __name__=='__main__':unittest.main()
