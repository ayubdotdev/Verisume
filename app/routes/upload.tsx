import {type FormEvent, useState, useEffect} from 'react'
import Navbar from "~/components/Navbar";
import FileUploader from "~/components/FileUploader";
import {usePuterStore} from "~/lib/puter";
import {useNavigate} from "react-router";
import {convertPdfToImage} from "~/lib/pdf2img";
import {generateUUID} from "~/lib/utils";
import { prepareInstructions } from '~/constants';

const Upload = () => {
    const { auth, isLoading, fs, ai, kv } = usePuterStore();
    const navigate = useNavigate();
    const [isProcessing, setIsProcessing] = useState(false);
    const [statusText, setStatusText] = useState('');
    const [file, setFile] = useState<File | null>(null);

    // Check authentication
    useEffect(() => {
        if (!isLoading && !auth.isAuthenticated) {
            navigate('/auth?next=/upload');
        }
    }, [isLoading, auth.isAuthenticated, navigate]);

    const handleFileSelect = (file: File | null) => {
        setFile(file)
    }

    const handleAnalyze = async ({ companyName, jobTitle, jobDescription, file }: { 
        companyName: string, 
        jobTitle: string, 
        jobDescription: string, 
        file: File  
    }) => {
        try {
            setIsProcessing(true);

            setStatusText('Uploading the file...');
            const uploadedFile = await fs.upload([file]);
            if(!uploadedFile) {
                setStatusText('Error: Failed to upload file');
                setIsProcessing(false);
                return;
            }

            setStatusText('Converting to image...');
            const imageFile = await convertPdfToImage(file);
            if(!imageFile.file) {
                setStatusText('Error: Failed to convert PDF to image');
                setIsProcessing(false);
                return;
            }

            setStatusText('Uploading the image...');
            const uploadedImage = await fs.upload([imageFile.file]);
            if(!uploadedImage) {
                setStatusText('Error: Failed to upload image');
                setIsProcessing(false);
                return;
            }

            setStatusText('Preparing data...');
            const uuid = generateUUID();

            const data = {
                id: uuid,
                resumePath: uploadedFile.path,
                imagePath: uploadedImage.path,
                companyName, 
                jobTitle, 
                jobDescription,
                feedback: null,
            }
            
            await kv.set(`resume:${uuid}`, JSON.stringify(data));
            setStatusText('Analyzing...');

            const feedback = await ai.feedback(
                uploadedFile.path,
                prepareInstructions({ jobTitle, jobDescription })
            )
            
            if (!feedback) {
                setStatusText('Error: Failed to analyze resume');
                setIsProcessing(false);
                return;
            }

            const feedbackText = typeof feedback.message.content === 'string'
                ? feedback.message.content
                : feedback.message.content[0].text;

            data.feedback = JSON.parse(feedbackText);
            await kv.set(`resume:${uuid}`, JSON.stringify(data));
            setStatusText('Analysis complete, redirecting...');
            console.log(data);
            navigate(`/resume/${uuid}`);
        } catch (error) {
            console.error('Error during analysis:', error);
            setStatusText('Error: Something went wrong during analysis');
            setIsProcessing(false);
        }
    }

    const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        
        // Get form data directly from the event target
        const formData = new FormData(e.currentTarget);

        const companyName = formData.get('company-name') as string;
        const jobTitle = formData.get('job-title') as string;
        const jobDescription = formData.get('job-description') as string;

        // Validate required fields
        if (!companyName?.trim()) {
            alert('Please enter a company name');
            return;
        }

        if (!jobTitle?.trim()) {
            alert('Please enter a job title');
            return;
        }

        if (!jobDescription?.trim()) {
            alert('Please enter a job description');
            return;
        }

        if (!file) {
            alert('Please select a PDF file to upload');
            return;
        }

        // Check if file is PDF
        if (file.type !== 'application/pdf') {
            alert('Please upload a PDF file');
            return;
        }

        handleAnalyze({ companyName, jobTitle, jobDescription, file });
    }

    // Show loading if not authenticated yet
    if (isLoading) {
        return (
            <main className="bg-[url('/images/bg-main.svg')] bg-cover">
                <Navbar />
                <section className="main-section">
                    <div className="page-heading">
                        <h1>Loading...</h1>
                    </div>
                </section>
            </main>
        );
    }

    return (
        <main className="bg-[url('/images/bg-main.svg')] bg-cover">
            <Navbar />

            <section className="main-section">
                <div className="page-heading py-16">
                    <h1>Smart feedback for your dream job</h1>
                    {isProcessing ? (
                        <>
                            <h2>{statusText}</h2>
                            <img src="/images/resume-scan.gif" className="w-full" />
                        </>
                    ) : (
                        <h2>Drop your resume for an ATS score and improvement tips</h2>
                    )}
                    {!isProcessing && (
                        <form id="upload-form" onSubmit={handleSubmit} className="flex flex-col gap-4 mt-8">
                            <div className="form-div">
                                <label htmlFor="company-name">Company Name *</label>
                                <input 
                                    type="text" 
                                    name="company-name" 
                                    placeholder="Company Name" 
                                    id="company-name" 
                                    required
                                />
                            </div>
                            <div className="form-div">
                                <label htmlFor="job-title">Job Title *</label>
                                <input 
                                    type="text" 
                                    name="job-title" 
                                    placeholder="Job Title" 
                                    id="job-title" 
                                    required
                                />
                            </div>
                            <div className="form-div">
                                <label htmlFor="job-description">Job Description *</label>
                                <textarea 
                                    rows={5} 
                                    name="job-description" 
                                    placeholder="Job Description" 
                                    id="job-description" 
                                    required
                                />
                            </div>

                            <div className="form-div">
                                <label htmlFor="uploader">Upload Resume (PDF) *</label>
                                <FileUploader onFileSelect={handleFileSelect} />
                                {file && (
                                    <p className="text-sm text-green-600 mt-2">
                                        Selected: {file.name}
                                    </p>
                                )}
                            </div>

                            <button 
                                className="primary-button" 
                                type="submit"
                                disabled={!file || isProcessing}
                            >
                                {isProcessing ? 'Analyzing...' : 'Analyze Resume'}
                            </button>
                        </form>
                    )}
                </div>
            </section>
        </main>
    )
}
export default Upload