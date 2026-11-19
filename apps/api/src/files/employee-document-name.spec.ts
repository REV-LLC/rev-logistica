import { employeeDocumentFilename } from './employee-document-name';
describe('employee document names',()=>{
  it('uses the saved full name and the category',()=>expect(employeeDocumentFilename({name:'SAMUEL',lastName:'GUERRERO'},'CEDULA',{originalname:'x.pdf',mimetype:'application/pdf'})).toBe('samuel_guerrero_cedula.pdf'));
  it('normalizes spaces, accents and unsafe characters',()=>expect(employeeDocumentFilename({name:' José  Luis ',lastName:'Muñoz / ../Gómez'},'CURSO_ALTURAS',{originalname:'scan.PNG',mimetype:'image/png'})).toBe('jose_luis_munoz_gomez_curso_alturas.png'));
  it('preserves the real extension and never treats an executable extension as a document',()=>{
    expect(employeeDocumentFilename({name:'Ana'},'EPS',{originalname:'scan.JPEG',mimetype:'image/jpeg'})).toBe('ana_eps.jpeg');
    expect(employeeDocumentFilename({name:'Ana'},'ARL',{originalname:'x.exe',mimetype:'application/pdf'})).toBe('ana_arl.pdf');
    expect(employeeDocumentFilename({name:'Ana'},'CONTRATO',{originalname:'x.docx',mimetype:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'})).toBe('ana_contrato.docx');
  });
});
