import unittest

from sop_dataset import parse, parse_wires, render


class SopDatasetTest(unittest.TestCase):
    def test_crlf_and_terminal_carriage_return(self):
        circuit = '@r1 w.request.request act=ask text="first\\rsecond"\n@r1.t w.request.target request=$r1 family=chart mode=existing'

        expected = parse_wires(circuit)
        self.assertEqual(parse_wires(circuit.replace('\n', '\r\n') + '\r'), expected)
        self.assertEqual(dict(expected[0][2])['text'], 'first\rsecond')

    def test_answer_lookup_round_trip(self):
        text = 'List the leading products. Which of them has the highest margin?'
        circuit = '''@list w.request.request act=ask mood=ask words="List the leading products" predicate=List question=list
@list.t w.request.target request=$list family=chart mode=existing fill=context
@list.l w.request.lookup request=$list target=$list.t key=thing from=page
@margin w.request.request act=ask mood=ask words="Which of them has the highest margin" predicate=Which question=which
@margin.t w.request.target request=$margin family=chart mode=existing fill=context
@margin.l w.request.lookup request=$margin target=$margin.t key=thing from=page
@margin.a w.request.lookup request=$margin key=answer from=request antecedent=$list words=them'''
        row, _ = parse(text, circuit, 'diagram')
        expected = [
            {'key': 'thing', 'from': 'page'},
            {'key': 'answer', 'from': 'request', 'antecedent': 0, 'words': 'them'},
        ]

        self.assertEqual(row['requests'][1]['lookup'], expected)
        restored, _ = parse(text, render(row), 'diagram')
        self.assertEqual(restored['requests'][1]['lookup'], expected)


if __name__ == '__main__':
    unittest.main()
