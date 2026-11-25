import copy
import re
import unittest

from sop_dataset import coverage, evidence, parse, parse_wires, render


# Two requests of one message, each with its own intents: a chart creation and a non-chart analytical result (a table).
# The intent wires are deliberately interleaved and one of them comes before the wire of the request it belongs to.
INTENTS_TEXT = ('Make a bar chart of revenue by region for the board and for the annual review, put it in the quarterly '
                'report, not for social media. Give me the average margin by product as a table in the appendix, to '
                'compare the regions.')
INTENTS_CIRCUIT = '''@r1 w.request.request act=make mood=do words="Make a bar chart of revenue by region for the board and for the annual review, put it in the quarterly report, not for social media" predicate=Make
@r1.t w.request.target request=$r1 family=chart mode=new
@r1.c1 w.request.constraint request=$r1 on=attribute attribute=chart.dimension value=region operator=eq words="by region"
@r1.i1 w.request.intent role=purpose value="for the board" words="for the board" request=$r1
@r2.i1 w.request.intent request=$r2 role=purpose value="to compare the regions" words="to compare the regions"
@r2 w.request.request act=ask mood=ask words="Give me the average margin by product as a table in the appendix, to compare the regions" predicate=Give question=what
@r2.t w.request.target request=$r2 family=table mode=new
@r2.c1 w.request.constraint request=$r2 on=attribute attribute=chart.aggregate value=avg operator=eq words=average
@r1.i2 w.request.intent request=$r1 role=purpose value="for the annual review" words="for the annual review"
@r2.i2 w.request.intent request=$r2 role=destination value="the appendix" words="in the appendix"
@r1.i3 w.request.intent request=$r1 role=destination value="the quarterly report" words="in the quarterly report"
@r1.i4 w.request.intent request=$r1 role=purpose value="social media" words="not for social media" want=no'''

CHART_INTENTS = [
    {'role': 'purpose', 'value': 'for the board', 'words': 'for the board', 'polarity': 'positive'},
    {'role': 'purpose', 'value': 'for the annual review', 'words': 'for the annual review', 'polarity': 'positive'},
    {'role': 'destination', 'value': 'the quarterly report', 'words': 'in the quarterly report', 'polarity': 'positive'},
    {'role': 'purpose', 'value': 'social media', 'words': 'not for social media', 'polarity': 'negative'},
]
TABLE_INTENTS = [
    {'role': 'purpose', 'value': 'to compare the regions', 'words': 'to compare the regions', 'polarity': 'positive'},
    {'role': 'destination', 'value': 'the appendix', 'words': 'in the appendix', 'polarity': 'positive'},
]


def facts(intents):
    """The intent facts of a request, order aside: an intent list keeps wire order, which carries no meaning."""
    return sorted((it['role'], it['value'], it['words'], it['polarity']) for it in intents)


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

    def test_intents_are_kept_by_their_owning_request(self):
        row, _ = parse(INTENTS_TEXT, INTENTS_CIRCUIT, 'diagram')

        self.assertEqual(len(row['requests']), 2)
        self.assertEqual(row['requests'][0]['intents'], CHART_INTENTS)
        self.assertEqual(row['requests'][1]['intents'], TABLE_INTENTS)

    def test_intents_round_trip_through_typed_wires(self):
        row, _ = parse(INTENTS_TEXT, INTENTS_CIRCUIT, 'diagram')
        circuit = render(row)
        wires = parse_wires(circuit)
        intents = [w for w in wires if w[1] == 'w.request.intent']

        self.assertEqual(len(intents), 6)
        self.assertTrue(all(dict(attrs)['request'].startswith('$r') for _, _, attrs in intents))
        self.assertEqual([dict(attrs)['request'] for _, _, attrs in intents if dict(attrs).get('want') == 'no'], ['$r1'])
        restored, _ = parse(INTENTS_TEXT, circuit, 'diagram')
        self.assertEqual([q['intents'] for q in restored['requests']], [CHART_INTENTS, TABLE_INTENTS])
        self.assertEqual(render(restored), circuit)  # parse -> render is a fixed point after the first normalization

    def test_intents_attach_by_reference_not_by_order_or_proximity(self):
        # r1's second intent stands after r2's wires and r2's first intent stands before r2 itself: the owner reference
        # decides, and permuting the intent wires leaves each request's list the same.
        row, _ = parse(INTENTS_TEXT, INTENTS_CIRCUIT, 'diagram')
        reordered = INTENTS_CIRCUIT.split('\n')
        mine = [i for i, line in enumerate(reordered) if 'w.request.intent' in line]
        moved = [reordered[i] for i in reversed(mine)]
        for i, line in zip(mine, moved):
            reordered[i] = line
        other, _ = parse(INTENTS_TEXT, '\n'.join(reordered), 'diagram')

        self.assertEqual(facts(other['requests'][0]['intents']), facts(CHART_INTENTS))
        self.assertEqual(facts(other['requests'][1]['intents']), facts(TABLE_INTENTS))
        self.assertEqual([facts(q['intents']) for q in other['requests']], [facts(q['intents']) for q in row['requests']])

    def test_intents_with_missing_or_invalid_owner_are_refused(self):
        cases = {
            'no owner': '@r1 w.request.request act=make mood=do\n@r1.t w.request.target request=$r1 family=chart mode=new\n'
                        '@r1.i1 w.request.intent role=purpose value="for the board" words="for the board"',
            'owner is not a reference': '@r1 w.request.request act=make mood=do\n@r1.t w.request.target request=$r1 family=chart mode=new\n'
                                       '@r1.i1 w.request.intent request=r1 role=purpose value="for the board" words="for the board"',
            'unknown owner': '@r1 w.request.request act=make mood=do\n@r1.t w.request.target request=$r1 family=chart mode=new\n'
                             '@r1.i1 w.request.intent request=$rX role=purpose value="for the board" words="for the board"',
            'owner is a target, not a request': '@r1 w.request.request act=make mood=do\n@r1.t w.request.target request=$r1 family=chart mode=new\n'
                                                '@r1.i1 w.request.intent request=$r1.t role=purpose value="for the board" words="for the board"',
        }
        patterns = {
            'no owner': r'no owner',
            'owner is not a reference': r'not a request reference',
            'unknown owner': r'not a request of this circuit',
            'owner is a target, not a request': r'not a request of this circuit',
        }
        for name, circuit in cases.items():
            with self.subTest(name), self.assertRaisesRegex(ValueError, patterns[name]):
                parse(INTENTS_TEXT, circuit, 'diagram')

    def test_intents_with_a_quoted_or_a_repeated_owner_are_refused(self):
        # A quoted owner is text that looks like a reference, and two owners are one intent with two owners: neither
        # is resolved by taking the first token, as parsing the first attribute of a wire used to do.
        base = '@r1 w.request.request act=make mood=do\n@r1.t w.request.target request=$r1 family=chart mode=new\n'
        cases = {
            'quoted owner': (base + '@r1.i1 w.request.intent request="$r1" role=purpose value="for the board" words="for the board"',
                             r'not a request reference'),
            'two owners': (base + '@r1.i1 w.request.intent request=$r1 request=$r2 role=purpose value="for the board" words="for the board"',
                           r'more than one owner'),
        }
        for name, (circuit, pattern) in cases.items():
            with self.subTest(name), self.assertRaisesRegex(ValueError, pattern):
                parse(INTENTS_TEXT, circuit, 'diagram')

    def test_intents_with_a_blank_or_non_string_value_or_evidence_are_refused(self):
        # A blank evidence would be read back as an empty `words` and fail in render only; a number is not the written
        # text of a purpose or a destination. Both are refused where they are read.
        base = '@r1 w.request.request act=make mood=do\n@r1.t w.request.target request=$r1 family=chart mode=new\n'
        wire = '@r1.i1 w.request.intent request=$r1 role=purpose '
        cases = {
            'blank evidence': (base + wire + 'value="for the board" words=""', r'no evidence'),
            'numeric evidence': (base + wire + 'value="for the board" words=42', r'is not a string'),
            'blank value': (base + wire + 'words="for the board" value=""', r'no value'),
            'numeric value': (base + wire + 'value=42 words="for the board"', r'is not a string'),
        }
        for name, (circuit, pattern) in cases.items():
            with self.subTest(name), self.assertRaisesRegex(ValueError, pattern):
                parse(INTENTS_TEXT, circuit, 'diagram')

    def test_intents_keep_quoted_text_and_ordinary_atoms_as_values(self):
        base = '@r1 w.request.request act=make mood=do\n@r1.t w.request.target request=$r1 family=chart mode=new\n'
        circuit = (base + '@r1.i1 w.request.intent request=$r1 role=purpose value="for the board" words="for the board"\n'
                          + '@r1.i2 w.request.intent request=$r1 role=destination value=appendix words=appendix')
        row, _ = parse('Make a bar chart for the board in the appendix', circuit, 'diagram')

        self.assertEqual(facts(row['requests'][0]['intents']),
                         facts([{'role': 'purpose', 'value': 'for the board', 'words': 'for the board', 'polarity': 'positive'},
                                {'role': 'destination', 'value': 'appendix', 'words': 'appendix', 'polarity': 'positive'}]))

    def test_intent_text_that_looks_like_a_reference_keeps_its_type(self):
        # "$r1" written as text stays text: it is rendered quoted, so reading the circuit back gives the same string
        # instead of a bare reference, and a bare $r1 in a text slot is refused rather than read as a reference.
        base = '@r1 w.request.request act=make mood=do\n@r1.t w.request.target request=$r1 family=chart mode=new\n'
        text = 'Make a bar chart for $r1'
        circuit = base + '@r1.i1 w.request.intent request=$r1 role=purpose value="$r1" words="$r1"'
        row, _ = parse(text, circuit, 'diagram')
        expected = [{'role': 'purpose', 'value': '$r1', 'words': '$r1', 'polarity': 'positive'}]

        self.assertEqual(row['requests'][0]['intents'], expected)
        out = render(row)
        self.assertIn('value="$r1" words="$r1"', out)
        self.assertNotIn('value=$r1', out)
        restored, _ = parse(text, out, 'diagram')
        self.assertEqual(restored['requests'][0]['intents'], expected)

    def test_intent_bare_reference_in_a_text_slot_is_refused(self):
        base = '@r1 w.request.request act=make mood=do\n@r1.t w.request.target request=$r1 family=chart mode=new\n'
        cases = {
            'bare value': base + '@r1.i1 w.request.intent request=$r1 role=purpose value=$r1 words="for the board"',
            'bare evidence': base + '@r1.i1 w.request.intent request=$r1 role=purpose value="for the board" words=$r1',
        }
        for name, circuit in cases.items():
            with self.subTest(name), self.assertRaisesRegex(ValueError, r'bare reference'):
                parse(INTENTS_TEXT, circuit, 'diagram')

    def test_intent_with_a_repeated_single_valued_slot_is_refused(self):
        # A second value/role/evidence/polarity is not merged and not dropped: the wire states one fact per slot.
        base = '@r1 w.request.request act=make mood=do\n@r1.t w.request.target request=$r1 family=chart mode=new\n'
        wire = '@r1.i1 w.request.intent request=$r1 role=purpose value="for the board" words="for the board"'
        cases = {
            'value': base + wire + ' value=other',
            'role': base + wire + ' role=destination',
            'words': base + wire + ' words="for the review"',
            'want': base + wire + ' want=yes want=no',
        }
        for name, circuit in cases.items():
            with self.subTest(name), self.assertRaisesRegex(ValueError, rf'{name} is given more than once'):
                parse(INTENTS_TEXT, circuit, 'diagram')

    def test_intent_evidence_is_collected_for_each_request(self):
        # The coverage pass sees a word as represented when some wire of its request holds it: an intent holds its own
        # evidence, so its words are not reported as uncovered content ("not for social media", "to compare the regions").
        row, _ = parse(INTENTS_TEXT, INTENTS_CIRCUIT, 'diagram')
        uncovered = [w.lower() for w in coverage(row)[1]]

        self.assertIn('not for social media', evidence(row['requests'][0], INTENTS_TEXT))
        self.assertIn('to compare the regions', evidence(row['requests'][1], INTENTS_TEXT))
        for q in row['requests']:
            for it in q['intents']:
                for w in re.findall(r"[A-Za-z0-9]+(?:['’][A-Za-z]+)?", it['words']):
                    self.assertNotIn(w.lower(), uncovered)

    def test_intents_with_invalid_role_value_evidence_or_want_are_refused(self):
        base = '@r1 w.request.request act=make mood=do\n@r1.t w.request.target request=$r1 family=chart mode=new\n'
        cases = {
            'role': (base + '@r1.i1 w.request.intent request=$r1 role=reason value="for the board" words="for the board"', r'role .* is not one of purpose, destination'),
            'value': (base + '@r1.i1 w.request.intent request=$r1 role=purpose words="for the board"', r'no value'),
            'evidence': (base + '@r1.i1 w.request.intent request=$r1 role=purpose value="for the board"', r'no evidence'),
            'want': (base + '@r1.i1 w.request.intent request=$r1 role=purpose value="for the board" words="for the board" want=maybe', r'want .* is not yes or no'),
        }
        for name, (circuit, pattern) in cases.items():
            with self.subTest(name), self.assertRaisesRegex(ValueError, pattern):
                parse(INTENTS_TEXT, circuit, 'diagram')

    def test_render_refuses_a_malformed_intent(self):
        row, _ = parse(INTENTS_TEXT, INTENTS_CIRCUIT, 'diagram')
        cases = {
            'role': (lambda it: it.update(role='reason'), r'role .* is not one of purpose, destination'),
            'value': (lambda it: it.pop('value'), r'no value'),
            'evidence': (lambda it: it.update(words=''), r'no evidence'),
            'polarity': (lambda it: it.update(polarity='maybe'), r'polarity .* is not positive or negative'),
        }
        for name, (break_it, pattern) in cases.items():
            with self.subTest(name):
                broken = copy.deepcopy(row)
                break_it(broken['requests'][1]['intents'][0])
                with self.assertRaisesRegex(ValueError, pattern):
                    render(broken)

    def test_a_circuit_without_intents_is_unchanged(self):
        circuit = '''@r1 w.request.request act=make mood=do words="a red circle" predicate=Make
@r1.t w.request.target request=$r1 family=drawn mode=new
@r1.c1 w.request.constraint request=$r1 on=attribute attribute=drawn.colour value=red operator=eq words=red'''
        row, _ = parse('a red circle', circuit, 'drawing')

        self.assertNotIn('intents', row['requests'][0])
        out = render(row)
        self.assertNotIn('w.request.intent', out)
        restored, _ = parse('a red circle', out, 'drawing')
        self.assertNotIn('intents', restored['requests'][0])


if __name__ == '__main__':
    unittest.main()
