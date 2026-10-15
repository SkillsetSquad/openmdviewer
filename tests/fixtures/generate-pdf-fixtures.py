"""Independent local PDF import fixtures; no user data or external resources."""
from pathlib import Path
from io import BytesIO
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics, ttfonts, pdfdoc
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.lib.pdfencrypt import StandardEncryption
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw
import reportlab

output = Path(__file__).parent / 'pdf'
output.mkdir(exist_ok=True)
pdfmetrics.registerFont(UnicodeCIDFont('HeiseiMin-W3'))
pdfmetrics.registerFont(ttfonts.TTFont('FixtureVera', str(Path(reportlab.__file__).parent / 'fonts' / 'Vera.ttf')))
scan = Image.new('RGB', (900, 350), 'white')
draw = ImageDraw.Draw(scan)
draw.text((35, 50), 'IMAGE-ONLY PAGE: HUMAN-READABLE SCAN FIXTURE', fill='black', font_size=24)
draw.text((35, 130), 'This text is pixels, not a selectable PDF text layer.', fill='black', font_size=22)
image = ImageReader(scan)

def text_page(pdf, heading, lines):
    pdf.setFont('FixtureVera', 20); pdf.drawString(48, 730, heading)
    pdf.setFont('FixtureVera', 11)
    for index, line in enumerate(lines): pdf.drawString(48, 690-index*22, line)

pdf = canvas.Canvas(str(output/'extractable.pdf'), pagesize=(612, 792), invariant=1)
pdf.setTitle('Independent PDF extraction fixture')
text_page(pdf, 'Local PDF fixture', ['First page: selectable text remains on this device.', 'Unicode: café, naïve, résumé, Ångström.', '# Literal heading marker; [brackets] *stars* | pipes |.', '<script>window.__pdfScript=true</script>', 'Second line within the same source page.'])
pdf.linkURL('https://pdf-attacker.invalid/action', (48, 540, 350, 565), relative=0)
pdf._doc.Catalog.OpenAction = pdfdoc.PDFDictionary({'S':pdfdoc.PDFName('JavaScript'), 'JS':pdfdoc.PDFString('this.getURL("https://pdf-attacker.invalid/open");')})
pdf.showPage()
text_page(pdf, 'Second source page', ['A different page has its own extracted section.', 'The literal formula is a < b and x > y.', 'End of extractable content.'])
pdf.showPage(); pdf.drawImage(image, 36, 450, width=540, height=210); pdf.showPage(); pdf.save()

pdf = canvas.Canvas(str(output/'scan-only.pdf'), pagesize=(612, 792), invariant=1)
pdf.setTitle('Image-only source fixture'); pdf.drawImage(image, 36, 450, width=540, height=210); pdf.showPage(); pdf.save()

# Public test-only password, not an account credential. Original encrypted bytes are preserved in tests.
pdf = canvas.Canvas(str(output/'password.pdf'), pagesize=(612,792), invariant=1, encrypt=StandardEncryption('fixture-open', ownerPassword='fixture-owner', canCopy=1, strength=128))
pdf.setTitle('Password fixture'); text_page(pdf,'Unlocked local PDF',['Password text is processed locally.', 'No password belongs in the exported workspace.']); pdf.showPage(); pdf.save()

pdf=canvas.Canvas(str(output/'layout.pdf'),pagesize=(612,792),invariant=1)
pdf.setTitle('Page 2'); pdf.setFont('FixtureVera',18); pdf.drawString(40,740,'Two-column source layout')
pdf.setFont('FixtureVera',11)
for index,line in enumerate(['Left column first.', 'Left column second.', 'Left column end.']): pdf.drawString(40,690-index*24,line)
for index,line in enumerate(['Right column first.', 'Right column second.', 'Right column end.']): pdf.drawString(330,690-index*24,line)
pdf.showPage();pdf.setPageRotation(90);pdf.setFont('FixtureVera',16);pdf.drawString(40,540,'Rotated source page');pdf.setFont('FixtureVera',11);pdf.drawString(40,500,'Rotation is preserved as text, not inferred Markdown structure.');pdf.showPage();pdf.setPageRotation(0);pdf.setFont('FixtureVera',18);pdf.drawString(40,740,'Predefined character-map page');pdf.setFont('HeiseiMin-W3',16);pdf.drawString(40,690,'日本語のテキスト');pdf.showPage();pdf.save()
print('Created four PDF fixtures in',output)
